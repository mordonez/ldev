import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {
  formatLiferayResourceExportAdts,
  runLiferayResourceExportAdts,
} from '../../features/liferay/resource/liferay-resource-export-adts.js';
import {
  formatLiferayResourceExportFragments,
  runLiferayResourceExportFragments,
} from '../../features/liferay/resource/liferay-resource-export-fragments.js';
import {
  formatLiferayResourceExportStructures,
  runLiferayResourceExportStructures,
} from '../../features/liferay/resource/liferay-resource-export-structures.js';
import {
  formatLiferayResourceExportTemplates,
  runLiferayResourceExportTemplates,
} from '../../features/liferay/resource/liferay-resource-export-templates.js';

export const DASHBOARD_RESOURCE_EXPORT_KINDS = ['templates', 'structures', 'adts', 'fragments'] as const;

export type DashboardResourceExportKind = (typeof DASHBOARD_RESOURCE_EXPORT_KINDS)[number];

type ResourceExportRunner = {
  command: string;
  run(config: AppConfig): Promise<unknown>;
  format(result: unknown): string;
};

const RESOURCE_EXPORT_RUNNERS: Record<DashboardResourceExportKind, ResourceExportRunner> = {
  templates: {
    command: 'export-templates',
    run: (config) => runLiferayResourceExportTemplates(config, {allSites: true}),
    format: (result) =>
      formatLiferayResourceExportTemplates(result as Awaited<ReturnType<typeof runLiferayResourceExportTemplates>>),
  },
  structures: {
    command: 'export-structures',
    run: (config) => runLiferayResourceExportStructures(config, {allSites: true}),
    format: (result) =>
      formatLiferayResourceExportStructures(result as Awaited<ReturnType<typeof runLiferayResourceExportStructures>>),
  },
  adts: {
    command: 'export-adts',
    run: (config) => runLiferayResourceExportAdts(config, {allSites: true}),
    format: (result) =>
      formatLiferayResourceExportAdts(result as Awaited<ReturnType<typeof runLiferayResourceExportAdts>>),
  },
  fragments: {
    command: 'export-fragments',
    run: (config) => runLiferayResourceExportFragments(config, {allSites: true}),
    format: (result) =>
      formatLiferayResourceExportFragments(result as Awaited<ReturnType<typeof runLiferayResourceExportFragments>>),
  },
};

export function normalizeDashboardResourceKinds(resources: unknown): DashboardResourceExportKind[] {
  if (!Array.isArray(resources)) {
    return [];
  }

  const allowed = new Set<string>(DASHBOARD_RESOURCE_EXPORT_KINDS);
  const unique = new Set<DashboardResourceExportKind>();

  for (const resource of resources) {
    if (typeof resource === 'string' && allowed.has(resource)) {
      unique.add(resource as DashboardResourceExportKind);
    }
  }

  return Array.from(unique);
}

export async function runDashboardResourceExport(
  config: AppConfig,
  resources: DashboardResourceExportKind[],
  printer: Printer,
  writeTaskLines: (printer: Printer, output: string) => void,
): Promise<void> {
  for (const resource of resources) {
    const runner = RESOURCE_EXPORT_RUNNERS[resource];
    printer.info(`Running resource ${runner.command} --all-sites`);
    const result = await runner.run(config);
    writeTaskLines(printer, runner.format(result));
  }
}
