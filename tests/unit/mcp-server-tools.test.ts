import {readFile} from 'node:fs/promises';

import {describe, expect, test} from 'vitest';

import {ALL_TOOLS, TOOL_CATALOG} from '../../src/entrypoints/mcp-server/mcp-server-tools.js';
import {validateToolResult} from '../../src/entrypoints/mcp-server/mcp-server.js';
import {jsonToolResult} from '../../src/entrypoints/mcp-server/tools/tool-result.js';

describe('mcp server tools', () => {
  test('registers the primary agent-facing tools', () => {
    const toolNames = ALL_TOOLS.map((tool) => tool.TOOL_NAME);

    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(toolNames).toEqual([
      'ldev_context',
      'ldev_ai_bootstrap',
      'liferay_check',
      'ldev_status',
      'ldev_logs_diagnose',
      'liferay_inventory_sites',
      'liferay_inventory_preflight',
      'liferay_inventory_structures',
      'liferay_inventory_pages',
      'liferay_inventory_page',
      'liferay_inventory_where_used',
      'liferay_doctor',
      'liferay_inventory_templates',
      'liferay_deploy_status',
      'liferay_osgi_status',
      'liferay_osgi_diag',
      'liferay_osgi_thread_dump',
      'liferay_mcp_check',
    ]);
  });

  test('catalog records risk, fallback and output contracts for automatable tools', () => {
    expect(TOOL_CATALOG).toHaveLength(ALL_TOOLS.length);

    for (const entry of TOOL_CATALOG) {
      expect(entry.risk).toMatch(/^(read|artifact|mutating)$/);
      expect(entry.fallbackCli).toContain('ldev ');
      expect(entry.outputSchema).toBeDefined();
      if (entry.risk === 'artifact') {
        expect(entry.writesFiles).toBe(true);
      }
    }

    const bootstrap = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'ldev_ai_bootstrap');
    const preflight = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_preflight');
    expect(bootstrap?.outputSchema).toBeDefined();
    expect(bootstrap?.writesFiles).toBe(true);
    expect(preflight?.outputSchema).toBeDefined();
  });

  test('MCP agent docs document every current tool fallback', async () => {
    const agentDocs = [
      ['docs/agentic/mcp-decision-route.md', await readFile('docs/agentic/mcp-decision-route.md', 'utf8')],
      ['templates/ai/install/AGENTS.md', await readFile('templates/ai/install/AGENTS.md', 'utf8')],
    ];

    for (const tool of ALL_TOOLS) {
      for (const [filePath, content] of agentDocs) {
        expect(content, `${filePath}: ${tool.TOOL_NAME}`).toContain(tool.TOOL_NAME);
        expect(content, `${filePath}: ${tool.TOOL_NAME}`).toContain(tool.fallbackCli);
      }
    }
  });

  test('returns structured content while keeping text JSON compatibility', () => {
    const result = jsonToolResult({ok: true, count: 2});

    expect(result.structuredContent).toEqual({ok: true, count: 2});
    expect(result.content[0]).toEqual({type: 'text', text: '{\n  "ok": true,\n  "count": 2\n}'});
  });

  test('validates structures tool output against its object result contract', () => {
    const structuresTool = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_structures');
    expect(structuresTool?.outputSchema).toBeDefined();

    const result = validateToolResult(
      jsonToolResult({
        sites: [
          {
            siteGroupId: 20120,
            siteFriendlyUrl: '/global',
            siteName: 'Global',
            structures: [
              {
                id: 123,
                key: 'BASIC',
                name: 'Basic',
                templates: [{id: '456', name: 'Basic Template', externalReferenceCode: 'BASIC_TEMPLATE'}],
              },
            ],
          },
        ],
        summary: {totalSites: 1, totalStructures: 1},
      }),
      structuresTool!,
    );

    expect(result.isError).toBeUndefined();
  });

  test('validates page tree and page inspection outputs against public contracts', () => {
    const pagesTool = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_pages');
    const pageTool = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_page');
    expect(pagesTool?.outputSchema).toBeDefined();
    expect(pageTool?.outputSchema).toBeDefined();

    const pagesResult = validateToolResult(
      jsonToolResult({
        inventoryType: 'pages',
        groupId: 20120,
        siteName: 'Global',
        siteFriendlyUrl: '/global',
        privateLayout: false,
        sitePathPrefix: '/web/global',
        inspectCommandTemplate: 'inventory page --url <fullUrl>',
        pageCount: 1,
        pages: [
          {
            pageType: 'regularPage',
            pageSubtype: 'content',
            name: 'Home',
            friendlyUrl: '/home',
            fullUrl: '/web/global/home',
            pageCommand: 'inventory page --url /web/global/home',
            layoutId: 1,
            plid: 2,
            hidden: false,
            children: [],
          },
        ],
      }),
      pagesTool!,
    );

    const pageResult = validateToolResult(
      jsonToolResult({
        page: {
          type: 'siteRoot',
          siteName: 'Global',
          siteFriendlyUrl: '/global',
          groupId: 20120,
          url: '/web/global',
        },
        pages: [{layoutId: 1, friendlyUrl: '/home', name: 'Home', type: 'content'}],
      }),
      pageTool!,
    );

    expect(pagesResult.isError).toBeUndefined();
    expect(pageResult.isError).toBeUndefined();
  });

  test('returns a tool error when output validation fails', () => {
    const sitesTool = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_sites');
    expect(sitesTool?.outputSchema).toBeDefined();

    const result = validateToolResult(jsonToolResult({sites: []}), sitesTool!);
    const [content] = result.content;

    expect(result.isError).toBe(true);
    expect(content.type).toBe('text');
    if (content.type === 'text') {
      expect(content.text).toContain('liferay_inventory_sites');
    }
  });

  test('validates later text content when earlier text is not JSON', () => {
    const sitesTool = ALL_TOOLS.find((tool) => tool.TOOL_NAME === 'liferay_inventory_sites');
    expect(sitesTool?.outputSchema).toBeDefined();

    const result = validateToolResult(
      {
        content: [
          {type: 'text', text: 'preface'},
          {
            type: 'text',
            text: JSON.stringify([
              {
                groupId: 20120,
                siteFriendlyUrl: '/global',
                name: 'Global',
                pagesCommand: 'ldev portal inventory pages --site /global --json',
              },
            ]),
          },
        ],
      },
      sitesTool!,
    );

    expect(result.isError).toBeUndefined();
  });
});
