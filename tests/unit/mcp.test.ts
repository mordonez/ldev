import fs from 'node:fs';
import path from 'node:path';

import {afterEach, describe, expect, test, vi} from 'vitest';

import {runMcpCheck, runMcpOpenApis, runMcpProbe} from '../../src/features/mcp/mcp.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('mcp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('check detects the working endpoint and feature flag state', async () => {
    const repoRoot = createTempDir('ldev-mcp-check-');
    fs.mkdirSync(path.join(repoRoot, 'configs', 'local'), {recursive: true});
    fs.writeFileSync(path.join(repoRoot, 'configs', 'local', 'portal-ext.properties'), 'feature.flag.LPD-63311=true\n');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/o/mcp')) {
        return new Response('{"message":"Session ID required"}', {
          status: 400,
          headers: {'Content-Type': 'application/json'},
        });
      }

      return new Response('not found', {status: 404});
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runMcpCheck(
      {
        repoRoot,
        liferay: {
          url: 'http://localhost:8080',
        },
      } as never,
      {username: 'test@liferay.com', password: 'test2'},
    );

    expect(result.selectedEndpoint).toBe('http://localhost:8080/o/mcp');
    expect(result.configuredFeatureFlag).toBe(true);
    expect(result.authorizationConfigured).toBe(true);
    expect(result.endpoints).toHaveLength(2);
  });

  test('probe initializes an MCP session', async () => {
    const fetchMock = vi.fn(async () => {
      const headers = new Headers();
      headers.set('Mcp-Session-Id', 'session-123');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2025-03-26',
            serverInfo: {name: 'Java SDK MCP Server', version: '0.15.0'},
          },
        }),
        {
          status: 200,
          headers,
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runMcpProbe(
      {
        repoRoot: null,
        liferay: {
          url: 'http://localhost:8080',
        },
      } as never,
      {authorizationHeader: 'Basic abc'},
    );

    expect(result.sessionId).toBe('session-123');
    expect(result.serverName).toBe('Java SDK MCP Server');
    expect(result.endpoint).toBe('http://localhost:8080/o/mcp');
  });

  test('openapis completes initialize, initialized notification, and tools/call flow', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"Session ID required"}', {
          status: 400,
          headers: {'Content-Type': 'application/json'},
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {name: 'Java SDK MCP Server', version: '0.15.0'},
            },
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-openapis'},
          },
        ),
      )
      .mockResolvedValueOnce(new Response('', {status: 200}))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              content: [{type: 'text', text: 'openapi-a\nopenapi-b'}],
            },
          }),
          {status: 200},
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await runMcpOpenApis(
      {
        repoRoot: null,
        liferay: {
          url: 'http://localhost:8080',
        },
      } as never,
      {authorizationHeader: 'Basic abc'},
    );

    expect(result.sessionId).toBe('session-openapis');
    expect(result.endpoint).toBe('http://localhost:8080/o/mcp');
    expect(result.raw).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [{type: 'text', text: 'openapi-a\nopenapi-b'}],
      },
    });
  });

  test('openapis accepts SSE-framed JSON payloads from the MCP server', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"message":"Session ID required"}', {
          status: 400,
          headers: {'Content-Type': 'application/json'},
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '2025-03-26',
              serverInfo: {name: 'Java SDK MCP Server', version: '0.15.0'},
            },
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-openapis-sse'},
          },
        ),
      )
      .mockResolvedValueOnce(new Response('', {status: 200}))
      .mockResolvedValueOnce(
        new Response(
          [
            'id: 2',
            'event: message',
            'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"openapi-a\\nopenapi-b"}]}}',
            '',
          ].join('\n'),
          {
            status: 200,
            headers: {'Content-Type': 'text/event-stream'},
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await runMcpOpenApis(
      {
        repoRoot: null,
        liferay: {
          url: 'http://localhost:8080',
        },
      } as never,
      {authorizationHeader: 'Basic abc'},
    );

    expect(result.sessionId).toBe('session-openapis-sse');
    expect(result.endpoint).toBe('http://localhost:8080/o/mcp');
    expect(result.raw).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [{type: 'text', text: 'openapi-a\nopenapi-b'}],
      },
    });
  });
});
