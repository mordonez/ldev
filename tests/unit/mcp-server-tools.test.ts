import {describe, expect, test} from 'vitest';

import {ALL_TOOLS} from '../../src/features/mcp-server/mcp-server-tools.js';
import {jsonToolResult} from '../../src/features/mcp-server/tools/tool-result.js';

describe('mcp server tools', () => {
  test('registers the primary agent-facing tools', () => {
    const toolNames = ALL_TOOLS.map((tool) => tool.TOOL_NAME);

    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(toolNames).toEqual([
      'ldev_context',
      'liferay_check',
      'ldev_status',
      'ldev_logs_diagnose',
      'liferay_inventory_sites',
      'liferay_inventory_structures',
      'liferay_inventory_pages',
      'liferay_inventory_page',
      'liferay_doctor',
      'liferay_inventory_templates',
      'liferay_deploy_status',
      'liferay_osgi_status',
      'liferay_osgi_diag',
      'liferay_osgi_thread_dump',
      'liferay_mcp_check',
    ]);
  });

  test('returns structured content while keeping text JSON compatibility', () => {
    const result = jsonToolResult({ok: true, count: 2});

    expect(result.structuredContent).toEqual({ok: true, count: 2});
    expect(result.content[0]).toEqual({type: 'text', text: '{\n  "ok": true,\n  "count": 2\n}'});
  });
});
