import {beforeEach, describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/schema.js';
import {runLiferayInventoryWhereUsed} from '../../src/features/liferay/inventory/liferay-inventory-where-used.js';

vi.mock('../../src/features/liferay/inventory/liferay-inventory-where-used.js', () => ({
  runLiferayInventoryWhereUsed: vi.fn(),
}));

const {handleTool} = await import('../../src/entrypoints/mcp-server/tools/tool-liferay-inventory-where-used.js');

describe('liferay_inventory_where_used MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('forwards where-used options and returns structured JSON content', async () => {
    vi.mocked(runLiferayInventoryWhereUsed).mockResolvedValue({
      inventoryType: 'whereUsedPlan',
      query: {type: 'template', keys: ['UB_TPL_DESTACATS_MULTIMEDIA']},
      scope: {
        sites: ['/labweb'],
        includePrivate: false,
        concurrency: 4,
        maxDepth: 12,
        siteOrder: 'content',
        siteLimit: 10,
        excludedSites: ['/global'],
        plan: true,
      },
      summary: {
        totalSites: 3,
        selectedSites: 1,
        excludedSites: 1,
        skippedSites: 0,
      },
      sites: [
        {
          rank: 1,
          siteFriendlyUrl: '/labweb',
          siteName: 'LabWeb',
          groupId: 4,
          structuredContents: 900,
          selectionReason: 'contentOrder',
        },
      ],
    } as never);

    const result = await handleTool(
      {
        type: 'template',
        keys: ['UB_TPL_DESTACATS_MULTIMEDIA'],
        sites: ['/labweb'],
        excludeSites: ['/global'],
        includePrivate: false,
        siteLimit: 10,
        siteOrder: 'content',
        plan: true,
        maxDepth: 12,
        concurrency: 4,
        pageSize: 200,
      },
      {} as AppConfig,
    );

    expect(runLiferayInventoryWhereUsed).toHaveBeenCalledWith(expect.anything(), {
      type: 'template',
      keys: ['UB_TPL_DESTACATS_MULTIMEDIA'],
      sites: ['/labweb'],
      excludeSites: ['/global'],
      includePrivate: false,
      siteLimit: 10,
      siteOrder: 'content',
      plan: true,
      maxDepth: 12,
      concurrency: 4,
      pageSize: 200,
    });
    expect(result.structuredContent).toEqual(expect.objectContaining({inventoryType: 'whereUsedPlan'}));
    expect(result.content[0]).toEqual(expect.objectContaining({type: 'text'}));
  });

  test('returns MCP error content when where-used fails', async () => {
    vi.mocked(runLiferayInventoryWhereUsed).mockRejectedValue(new Error('portal unavailable'));

    const result = await handleTool(
      {
        type: 'fragment',
        keys: ['banner'],
      },
      {} as AppConfig,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{type: 'text', text: 'portal unavailable'}]);
  });
});
