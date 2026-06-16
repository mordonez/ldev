import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test, vi} from 'vitest';

import {runMcpDoctor} from '../../src/entrypoints/mcp-server/mcp-server-doctor.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

vi.mock('../../src/core/platform/process.js', () => ({
  runProcess: vi.fn((command: string, args: string[]) => {
    if (command === 'node' || command === 'npx') {
      return {
        command: [command, ...args].join(' '),
        stdout: command === 'node' ? 'v22.0.0' : '10.0.0',
        stderr: '',
        exitCode: 0,
        ok: true,
      };
    }

    return {
      command: [command, ...args].join(' '),
      stdout: '',
      stderr: '',
      exitCode: 1,
      ok: false,
    };
  }),
}));

function writeConfig(targetDir: string, relPath: string, config: unknown): void {
  const configPath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(configPath), {recursive: true});
  fs.writeFileSync(configPath, JSON.stringify(config));
}

const LOCAL_ARGS = ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js'];
const NPX_ARGS = ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server'];

describe('mcp server doctor', () => {
  test('validates all client configs with local strategy', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-');
    const scriptPath = path.join(targetDir, 'node_modules', '@mordonezdev', 'ldev', 'dist', 'mcp-server.js');
    fs.mkdirSync(path.dirname(scriptPath), {recursive: true});
    fs.writeFileSync(scriptPath, '');

    writeConfig(targetDir, '.vscode/mcp.json', {
      servers: {ldev: {type: 'stdio', command: 'node', args: LOCAL_ARGS}},
    });
    writeConfig(targetDir, '.claude/mcp.json', {
      mcpServers: {ldev: {command: 'node', args: LOCAL_ARGS}},
    });
    writeConfig(targetDir, '.cursor/mcp.json', {
      mcpServers: {ldev: {command: 'node', args: LOCAL_ARGS}},
    });

    const result = await runMcpDoctor({targetDir, tool: 'all', handshake: false});

    expect(result.ok).toBe(true);
    expect(result.checkedTools).toEqual(['claude-code', 'cursor', 'vscode']);
    const vscodeResult = result.results.find((entry) => entry.tool === 'vscode');
    const claudeResult = result.results.find((entry) => entry.tool === 'claude-code');
    expect(vscodeResult?.configExists).toBe(true);
    expect(vscodeResult?.configValid).toBe(true);
    expect(vscodeResult?.configFormat).toBe('servers');
    expect(vscodeResult?.command).toBe('node');
    expect(vscodeResult?.commandCheck?.ok).toBe(true);
    expect(claudeResult?.configExists).toBe(true);
    expect(claudeResult?.configValid).toBe(true);
    expect(claudeResult?.configFormat).toBe('mcpServers');
    expect(claudeResult?.command).toBe('node');
    expect(claudeResult?.commandCheck?.ok).toBe(true);
  });

  test('fails when local strategy script is missing', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-missing-local-');
    writeConfig(targetDir, '.vscode/mcp.json', {
      servers: {ldev: {type: 'stdio', command: 'node', args: LOCAL_ARGS}},
    });

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(false);
    expect(result.results[0]?.commandCheck?.ok).toBe(false);
    expect(result.results[0]?.commandCheck?.stderr).toContain('Configured MCP server script does not exist');
  });

  test('validates npx strategy', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-npx-');
    writeConfig(targetDir, '.vscode/mcp.json', {
      servers: {ldev: {type: 'stdio', command: 'npx', args: NPX_ARGS}},
    });

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(true);
    expect(result.results[0]?.commandCheck?.command).toBe(
      'npx --package @mordonezdev/ldev -y ldev-mcp-server --version',
    );
  });

  test('rejects VSCode configs without stdio transport type', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-invalid-vscode-');
    writeConfig(targetDir, '.vscode/mcp.json', {
      servers: {ldev: {command: 'npx', args: NPX_ARGS}},
    });

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(false);
    expect(result.results[0]?.configValid).toBe(false);
    expect(result.results[0]?.error).toBe('Could not find ldev server config.');
  });
});
