import fs from 'node:fs';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_TIMEOUT_MS = 15_000;

export type McpAuthOptions = {
  authorizationHeader?: string;
  username?: string;
  password?: string;
};

export type McpCheckResult = {
  ok: true;
  baseUrl: string;
  configuredFeatureFlag: boolean | null;
  endpoints: Array<{
    url: string;
    status: number | null;
    reachable: boolean;
  }>;
  selectedEndpoint: string | null;
  authorizationConfigured: boolean;
};

export type McpProbeResult = {
  ok: true;
  endpoint: string;
  sessionId: string;
  protocolVersion: string;
  serverName: string;
  serverVersion: string;
};

export type McpOpenApisResult = {
  ok: true;
  endpoint: string;
  sessionId: string;
  raw: unknown;
};

export async function runMcpCheck(config: AppConfig, auth?: McpAuthOptions): Promise<McpCheckResult> {
  const candidates = buildEndpointCandidates(config.liferay.url);
  const endpoints: McpCheckResult['endpoints'] = [];

  for (const url of candidates) {
    const response = await safeFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/event-stream',
        ...buildAuthorizationHeaders(auth),
      },
    });
    endpoints.push({
      url,
      status: response?.status ?? null,
      reachable: response !== null,
    });
  }

  return {
    ok: true,
    baseUrl: config.liferay.url,
    configuredFeatureFlag: detectMcpFeatureFlag(config.repoRoot),
    selectedEndpoint: selectWorkingEndpoint(endpoints),
    endpoints,
    authorizationConfigured: Object.keys(buildAuthorizationHeaders(auth)).length > 0,
  };
}

export async function runMcpProbe(config: AppConfig, auth?: McpAuthOptions): Promise<McpProbeResult> {
  const authHeaders = await resolveAuthorizationHeaders(config, auth);
  const endpoint = await resolveMcpEndpoint(config, authHeaders);
  const initialize = await initializeMcpSession(endpoint, authHeaders);

  return {
    ok: true,
    endpoint,
    sessionId: initialize.sessionId,
    protocolVersion: initialize.result.protocolVersion,
    serverName: initialize.result.serverInfo?.name ?? 'unknown',
    serverVersion: initialize.result.serverInfo?.version ?? 'unknown',
  };
}

export async function runMcpOpenApis(config: AppConfig, auth?: McpAuthOptions): Promise<McpOpenApisResult> {
  const authHeaders = await resolveAuthorizationHeaders(config, auth);
  const endpoint = await resolveMcpEndpoint(config, authHeaders);
  const initialize = await initializeMcpSession(endpoint, authHeaders);

  await sendMcpNotification(endpoint, initialize.sessionId, 'notifications/initialized', {}, authHeaders);
  const result = await sendMcpRequest(
    endpoint,
    initialize.sessionId,
    'tools/call',
    {
      name: 'get-openapis',
      arguments: {},
    },
    authHeaders,
  );

  return {
    ok: true,
    endpoint,
    sessionId: initialize.sessionId,
    raw: result,
  };
}

export function formatMcpCheck(result: McpCheckResult): string {
  const lines = ['MCP_CHECK', `baseUrl=${result.baseUrl}`, `featureFlag=${String(result.configuredFeatureFlag)}`];
  for (const endpoint of result.endpoints) {
    lines.push(`endpoint=${endpoint.url} status=${endpoint.status ?? 'n/a'} reachable=${endpoint.reachable}`);
  }
  lines.push(`selectedEndpoint=${result.selectedEndpoint ?? 'none'}`);
  return lines.join('\n');
}

export function formatMcpProbe(result: McpProbeResult): string {
  return [
    'MCP_PROBE_OK',
    `endpoint=${result.endpoint}`,
    `sessionId=${result.sessionId}`,
    `protocolVersion=${result.protocolVersion}`,
    `serverName=${result.serverName}`,
    `serverVersion=${result.serverVersion}`,
  ].join('\n');
}

export function formatMcpOpenApis(result: McpOpenApisResult): string {
  return ['MCP_OPENAPIS_OK', `endpoint=${result.endpoint}`, `sessionId=${result.sessionId}`].join('\n');
}

async function resolveMcpEndpoint(config: AppConfig, authHeaders: Record<string, string>): Promise<string> {
  const candidates = buildEndpointCandidates(config.liferay.url);
  for (const url of candidates) {
    const response = await safeFetch(url, {
      method: 'GET',
      headers: {Accept: 'application/json, text/event-stream', ...authHeaders},
    });
    if (response !== null && response.status !== 404) {
      return url;
    }
  }
  throw new CliError('No MCP endpoint responded successfully.', {code: 'LIFERAY_MCP_INIT_ERROR'});
}

function buildEndpointCandidates(baseUrl: string): string[] {
  return [`${baseUrl}/o/mcp`, `${baseUrl}/o/mcp/sse`];
}

function selectWorkingEndpoint(endpoints: McpCheckResult['endpoints']): string | null {
  const preferred = endpoints.find((endpoint) => endpoint.status !== null && endpoint.status !== 404);
  return preferred?.url ?? null;
}

function detectMcpFeatureFlag(repoRoot: string | null): boolean | null {
  if (!repoRoot) {
    return null;
  }

  const candidates = [
    path.join(repoRoot, 'configs', 'local', 'portal-ext.properties'),
    path.join(repoRoot, 'bundles', 'portal-ext.properties'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const content = fs.readFileSync(candidate, 'utf8');
    if (content.includes('feature.flag.LPD-63311=true')) {
      return true;
    }
  }

  return false;
}

function buildAuthorizationHeaders(auth?: McpAuthOptions): Record<string, string> {
  const header = auth?.authorizationHeader?.trim() || process.env.LIFERAY_MCP_AUTHORIZATION_HEADER?.trim() || '';
  if (header !== '') {
    return {Authorization: header};
  }

  const username = auth?.username ?? process.env.LIFERAY_MCP_USERNAME ?? '';
  const password = auth?.password ?? process.env.LIFERAY_MCP_PASSWORD ?? '';
  if (username.trim() !== '' || password.trim() !== '') {
    return {Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`};
  }

  return {};
}

async function resolveAuthorizationHeaders(config: AppConfig, auth?: McpAuthOptions): Promise<Record<string, string>> {
  const explicit = buildAuthorizationHeaders(auth);
  if (Object.keys(explicit).length > 0) {
    return explicit;
  }

  // Fall back to ldev OAuth token when configured.
  const clientId = config.liferay.oauth2ClientId?.trim() ?? '';
  const clientSecret = config.liferay.oauth2ClientSecret?.trim() ?? '';
  if (clientId !== '' && clientSecret !== '') {
    try {
      const tokenClient = createOAuthTokenClient();
      const token = await tokenClient.fetchClientCredentialsToken({
        url: config.liferay.url,
        oauth2ClientId: clientId,
        oauth2ClientSecret: clientSecret,
        scopeAliases: config.liferay.scopeAliases ?? '',
        timeoutSeconds: 15,
      });
      return {Authorization: `${token.tokenType} ${token.accessToken}`};
    } catch {
      // OAuth not ready yet — proceed without auth.
    }
  }

  return {};
}

async function initializeMcpSession(
  endpoint: string,
  authHeaders: Record<string, string>,
): Promise<{
  sessionId: string;
  result: {
    protocolVersion: string;
    serverInfo?: {name?: string; version?: string};
  };
}> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'ldev',
          version: '0.1.0',
        },
      },
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new CliError(`MCP initialize failed (${response.status}): ${sanitizeBody(body)}`, {
      code: 'LIFERAY_MCP_INIT_ERROR',
    });
  }

  const sessionId = response.headers.get('Mcp-Session-Id')?.trim() ?? '';
  if (sessionId === '') {
    throw new CliError('MCP initialize did not return Mcp-Session-Id.', {code: 'LIFERAY_MCP_INIT_ERROR'});
  }

  const parsed = parseJson(body);
  const result = (parsed as {result?: {protocolVersion?: string; serverInfo?: {name?: string; version?: string}}})
    .result;
  if (!result?.protocolVersion) {
    throw new CliError('MCP initialize returned an unexpected payload.', {code: 'LIFERAY_MCP_INIT_ERROR'});
  }

  return {
    sessionId,
    result: {
      protocolVersion: result.protocolVersion,
      serverInfo: result.serverInfo,
    },
  };
}

async function sendMcpNotification(
  endpoint: string,
  sessionId: string,
  method: string,
  params: Record<string, unknown>,
  authHeaders: Record<string, string>,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId,
      ...authHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new CliError(`MCP notification failed (${response.status}): ${sanitizeBody(body)}`, {
      code: 'LIFERAY_MCP_NOTIFICATION_ERROR',
    });
  }
}

async function sendMcpRequest(
  endpoint: string,
  sessionId: string,
  method: string,
  params: Record<string, unknown>,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId,
      ...authHeaders,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method,
      params,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new CliError(`MCP request failed (${response.status}): ${sanitizeBody(body)}`, {
      code: 'LIFERAY_MCP_REQUEST_ERROR',
    });
  }

  return parseJson(body);
}

async function safeFetch(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    const ssePayload = tryParseSseJson(body);
    if (ssePayload !== null) {
      return ssePayload;
    }

    throw new CliError(`Invalid MCP JSON payload: ${sanitizeBody(body)}`, {code: 'LIFERAY_MCP_SSE_PARSE_ERROR'});
  }
}

function sanitizeBody(body: string): string {
  return body.replaceAll(/\s+/g, ' ').trim();
}

function tryParseSseJson(body: string): unknown | null {
  const dataLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const dataBody = dataLines.join('\n').trim();
  if (dataBody === '') {
    return null;
  }

  try {
    return JSON.parse(dataBody);
  } catch {
    return null;
  }
}
