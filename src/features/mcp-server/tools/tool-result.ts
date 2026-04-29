import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

export function jsonToolResult(value: unknown): CallToolResult {
  const content = [{type: 'text' as const, text: JSON.stringify(value, null, 2)}];
  return isStructuredContent(value) ? {structuredContent: value, content} : {content};
}

export function errorToolResult(error: unknown): CallToolResult {
  return {isError: true, content: [{type: 'text', text: error instanceof Error ? error.message : String(error)}]};
}

export async function runJsonTool(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return jsonToolResult(await action());
  } catch (error) {
    return errorToolResult(error);
  }
}

function isStructuredContent(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
