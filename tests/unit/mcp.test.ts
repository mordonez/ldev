import fs from 'node:fs';
import path from 'node:path';

import {afterEach, describe, expect, test, vi} from 'vitest';

import {LiferayErrorCode} from '../../src/features/liferay/errors/index.js';
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
      await Promise.resolve();
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
      await Promise.resolve();
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

  test('probe fails with MCP endpoint not found when no endpoint responds', async () => {
    const fetchMock = vi.fn(async () => {
      await Promise.resolve();
      return new Response('not found', {status: 404});
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      runMcpProbe(
        {
          repoRoot: null,
          liferay: {
            url: 'http://localhost:8080',
          },
        } as never,
        {authorizationHeader: 'Basic abc'},
      ),
    ).rejects.toMatchObject({code: LiferayErrorCode.MCP_ENDPOINT_NOT_FOUND});
  });

  test('probe fails with initialize-specific codes for non-ok, missing session id, and invalid payload', async () => {
    const cases = [
      {
        name: 'non-ok status',
        response: new Response('{"message":"forbidden"}', {status: 403}),
        code: LiferayErrorCode.MCP_INITIALIZE_FAILED,
      },
      {
        name: 'missing session id',
        response: new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {protocolVersion: '2025-03-26'},
          }),
          {status: 200},
        ),
        code: LiferayErrorCode.MCP_INITIALIZE_SESSION_ID_MISSING,
      },
      {
        name: 'invalid initialize payload',
        response: new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {serverInfo: {name: 'Java SDK MCP Server'}},
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-invalid-payload'},
          },
        ),
        code: LiferayErrorCode.MCP_INITIALIZE_INVALID_PAYLOAD,
      },
    ] as const;

    for (const testCase of cases) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          await Promise.resolve();
          return testCase.response.clone();
        }),
      );

      await expect(
        runMcpProbe(
          {
            repoRoot: null,
            liferay: {
              url: 'http://localhost:8080',
            },
          } as never,
          {authorizationHeader: 'Basic abc'},
        ),
      ).rejects.toMatchObject({code: testCase.code});
    }
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

  test('openapis fails with notification and request specific MCP codes', async () => {
    const notificationFetch = vi
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
            },
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-openapis'},
          },
        ),
      )
      .mockResolvedValueOnce(new Response('notification failed', {status: 500}));
    vi.stubGlobal('fetch', notificationFetch);

    await expect(
      runMcpOpenApis(
        {
          repoRoot: null,
          liferay: {
            url: 'http://localhost:8080',
          },
        } as never,
        {authorizationHeader: 'Basic abc'},
      ),
    ).rejects.toMatchObject({code: LiferayErrorCode.MCP_NOTIFICATION_FAILED});

    const requestFetch = vi
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
            },
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-openapis'},
          },
        ),
      )
      .mockResolvedValueOnce(new Response('', {status: 200}))
      .mockResolvedValueOnce(new Response('request failed', {status: 502}));
    vi.stubGlobal('fetch', requestFetch);

    await expect(
      runMcpOpenApis(
        {
          repoRoot: null,
          liferay: {
            url: 'http://localhost:8080',
          },
        } as never,
        {authorizationHeader: 'Basic abc'},
      ),
    ).rejects.toMatchObject({code: LiferayErrorCode.MCP_REQUEST_FAILED});
  });

  test('openapis fails with MCP parse error on invalid JSON and invalid SSE payloads', async () => {
    const invalidJsonFetch = vi
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
            },
          }),
          {
            status: 200,
            headers: {'Mcp-Session-Id': 'session-openapis'},
          },
        ),
      )
      .mockResolvedValueOnce(new Response('', {status: 200}))
      .mockResolvedValueOnce(new Response('not-json', {status: 200}));
    vi.stubGlobal('fetch', invalidJsonFetch);

    await expect(
      runMcpOpenApis(
        {
          repoRoot: null,
          liferay: {
            url: 'http://localhost:8080',
          },
        } as never,
        {authorizationHeader: 'Basic abc'},
      ),
    ).rejects.toMatchObject({code: LiferayErrorCode.MCP_PARSE_ERROR});

    const invalidSseFetch = vi
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
        new Response(['id: 2', 'event: message', 'data: {not-valid-json}', ''].join('\n'), {
          status: 200,
          headers: {'Content-Type': 'text/event-stream'},
        }),
      );
    vi.stubGlobal('fetch', invalidSseFetch);

    await expect(
      runMcpOpenApis(
        {
          repoRoot: null,
          liferay: {
            url: 'http://localhost:8080',
          },
        } as never,
        {authorizationHeader: 'Basic abc'},
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof Error)) {
        return false;
      }

      return (
        'code' in error &&
        error.code === LiferayErrorCode.MCP_PARSE_ERROR &&
        error.message.includes('Invalid MCP JSON payload')
      );
    });
  });
});
