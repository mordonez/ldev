import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, test, vi} from 'vitest';

import {runMcpDoctor} from '../../src/features/mcp-server/mcp-server-doctor.js';
import {runMcpSetup} from '../../src/features/mcp-server/mcp-server-setup.js';
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

describe('mcp server setup', () => {
  test('writes VS Code MCP config with servers format', async () => {
    const targetDir = createTempDir('ldev-vscode-mcp-');

    const result = await runMcpSetup({targetDir, tool: 'vscode'});

    expect(result.configPath).toBe(path.join(targetDir, '.vscode', 'mcp.json'));
    expect(result.strategy).toBe('npx');
    expect(JSON.parse(fs.readFileSync(result.configPath, 'utf8'))).toEqual({
      servers: {
        ldev: {
          type: 'stdio',
          command: 'npx',
          args: ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server'],
        },
      },
    });
  });

  test('merges VS Code MCP config without dropping existing servers', async () => {
    const targetDir = createTempDir('ldev-vscode-mcp-merge-');
    const configPath = path.join(targetDir, '.vscode', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), {recursive: true});
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        servers: {
          memory: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
          },
        },
      }),
    );

    const result = await runMcpSetup({targetDir, tool: 'vscode'});

    expect(result.merged).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toMatchObject({
      servers: {
        memory: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
        ldev: {
          type: 'stdio',
          command: 'npx',
        },
      },
    });
  });

  test('keeps Claude Code config in legacy mcpServers format', async () => {
    const targetDir = createTempDir('ldev-claude-mcp-');

    const result = await runMcpSetup({targetDir, tool: 'claude-code'});

    expect(result.configPath).toBe(path.join(targetDir, '.claude', 'mcp.json'));
    expect(JSON.parse(fs.readFileSync(result.configPath, 'utf8'))).toEqual({
      mcpServers: {
        ldev: {
          command: 'npx',
          args: ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server'],
        },
      },
    });
  });

  test('writes all client configs with an explicit local strategy', async () => {
    const targetDir = createTempDir('ldev-all-mcp-');
    fs.mkdirSync(path.join(targetDir, 'node_modules', '@mordonezdev', 'ldev', 'dist'), {recursive: true});

    const result = await runMcpSetup({targetDir, tool: 'all', strategy: 'local'});

    expect(result.tool).toBe('all');
    expect(result.strategy).toBe('local');
    expect(result.results).toHaveLength(3);
    expect(JSON.parse(fs.readFileSync(path.join(targetDir, '.vscode', 'mcp.json'), 'utf8'))).toEqual({
      servers: {
        ldev: {
          type: 'stdio',
          command: 'node',
          args: ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js'],
        },
      },
    });
    expect(JSON.parse(fs.readFileSync(path.join(targetDir, '.claude', 'mcp.json'), 'utf8'))).toEqual({
      mcpServers: {
        ldev: {
          command: 'node',
          args: ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js'],
        },
      },
    });
    expect(JSON.parse(fs.readFileSync(path.join(targetDir, '.cursor', 'mcp.json'), 'utf8'))).toEqual({
      mcpServers: {
        ldev: {
          command: 'node',
          args: ['./node_modules/@mordonezdev/ldev/dist/mcp-server.js'],
        },
      },
    });
  });

  test('doctor validates all generated configs and command resolution without handshake', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-');
    fs.mkdirSync(path.join(targetDir, 'node_modules', '@mordonezdev', 'ldev', 'dist'), {recursive: true});
    fs.writeFileSync(path.join(targetDir, 'node_modules', '@mordonezdev', 'ldev', 'dist', 'mcp-server.js'), '');
    await runMcpSetup({targetDir, tool: 'all', strategy: 'local'});

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
    expect(vscodeResult?.commandCheck?.command).toBe(
      'node ./node_modules/@mordonezdev/ldev/dist/mcp-server.js --version',
    );
    expect(claudeResult?.configExists).toBe(true);
    expect(claudeResult?.configValid).toBe(true);
    expect(claudeResult?.configFormat).toBe('mcpServers');
    expect(claudeResult?.command).toBe('node');
    expect(claudeResult?.commandCheck?.ok).toBe(true);
    expect(claudeResult?.commandCheck?.command).toBe(
      'node ./node_modules/@mordonezdev/ldev/dist/mcp-server.js --version',
    );
  });

  test('doctor fails local strategy when configured script is missing', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-missing-local-');
    await runMcpSetup({targetDir, tool: 'vscode', strategy: 'local'});

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(false);
    expect(result.results[0]?.commandCheck?.ok).toBe(false);
    expect(result.results[0]?.commandCheck?.stderr).toContain('Configured MCP server script does not exist');
    expect(result.results[0]?.handshake).toBeUndefined();
  });

  test('doctor validates npx strategy by running the configured command', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-npx-');
    await runMcpSetup({targetDir, tool: 'vscode', strategy: 'npx'});

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(true);
    expect(result.results[0]?.commandCheck?.command).toBe(
      'npx --package @mordonezdev/ldev -y ldev-mcp-server --version',
    );
  });

  test('doctor rejects VS Code configs without stdio transport type', async () => {
    const targetDir = createTempDir('ldev-mcp-doctor-invalid-vscode-');
    const configPath = path.join(targetDir, '.vscode', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), {recursive: true});
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        servers: {
          ldev: {
            command: 'npx',
            args: ['--package', '@mordonezdev/ldev', '-y', 'ldev-mcp-server'],
          },
        },
      }),
    );

    const result = await runMcpDoctor({targetDir, tool: 'vscode', handshake: false});

    expect(result.ok).toBe(false);
    expect(result.results[0]?.configValid).toBe(false);
    expect(result.results[0]?.error).toBe('Could not find ldev server config.');
  });
});
