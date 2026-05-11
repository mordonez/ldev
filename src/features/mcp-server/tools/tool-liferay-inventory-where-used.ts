import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {
  runLiferayInventoryWhereUsed,
  type WhereUsedResourceType,
} from '../../liferay/inventory/liferay-inventory-where-used.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_inventory_where_used';

export const inputSchema = {
  type: z
    .enum(['fragment', 'widget', 'portlet', 'structure', 'template', 'adt'])
    .describe('Portal resource type to reverse-lookup'),
  keys: z.array(z.string()).min(1).describe('One or more resource keys to OR-match'),
  sites: z.array(z.string()).optional().describe('Limit lookup to one or more sites'),
  excludeSites: z.array(z.string()).optional().describe('Exclude sites when scanning all accessible sites'),
  widgetType: z.string().optional().describe('ADT widget type filter used only when type=adt'),
  className: z.string().optional().describe('ADT class name filter used only when type=adt'),
  includePrivate: z.boolean().optional().describe('Also scan private layouts'),
  siteLimit: z.number().optional().describe('Maximum number of sites to scan when sites is not provided'),
  siteOrder: z.enum(['site', 'name', 'content']).optional().describe('Site prioritization: site | name | content'),
  plan: z.boolean().optional().describe('Return the selected site scan plan without inspecting pages'),
  maxDepth: z.number().optional().describe('Maximum page tree recursion depth'),
  concurrency: z.number().optional().describe('Parallel page fetches per site'),
  pageSize: z.number().optional().describe('Headless page size for site listings'),
};

export const description =
  'Reverse-lookup Pages that contain a given Fragment, Widget, Portlet, Structure, Template, or ADT.';

export async function handleTool(
  input: {
    type: WhereUsedResourceType;
    keys: string[];
    sites?: string[];
    excludeSites?: string[];
    widgetType?: string;
    className?: string;
    includePrivate?: boolean;
    siteLimit?: number;
    siteOrder?: 'site' | 'name' | 'content';
    plan?: boolean;
    maxDepth?: number;
    concurrency?: number;
    pageSize?: number;
  },
  config: AppConfig,
) {
  return runJsonTool(() =>
    runLiferayInventoryWhereUsed(config, {
      type: input.type,
      keys: input.keys,
      ...(input.sites ? {sites: input.sites} : {}),
      ...(input.excludeSites ? {excludeSites: input.excludeSites} : {}),
      ...(input.widgetType ? {widgetType: input.widgetType} : {}),
      ...(input.className ? {className: input.className} : {}),
      ...(input.includePrivate !== undefined ? {includePrivate: input.includePrivate} : {}),
      ...(input.siteLimit !== undefined ? {siteLimit: input.siteLimit} : {}),
      ...(input.siteOrder ? {siteOrder: input.siteOrder} : {}),
      ...(input.plan !== undefined ? {plan: input.plan} : {}),
      ...(input.maxDepth !== undefined ? {maxDepth: input.maxDepth} : {}),
      ...(input.concurrency !== undefined ? {concurrency: input.concurrency} : {}),
      ...(input.pageSize !== undefined ? {pageSize: input.pageSize} : {}),
    }),
  );
}
