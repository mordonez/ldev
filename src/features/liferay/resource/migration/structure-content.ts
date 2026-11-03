import type {AppConfig} from '../../../../core/config/load-config.js';
import type {Printer} from '../../../../core/output/printer.js';
import {normalizeScalarString} from '../../../../core/utils/text.js';
import {LiferayErrors} from '../../errors/index.js';
import type {LiferayGateway} from '../../liferay-gateway.js';
import {
  applyMappings,
  contentFieldsEqual,
  copyIfPresent,
  toApiContentFields,
  type StructuredContentRow,
} from './structure-content-fields.js';
import {parseStringList, readMigrationPlanData} from './structure-content-plan.js';
import {
  fetchStructureDefinitionFields,
  fetchStructuredContentForMigration,
  selectStructureContents,
  type StructureLookup,
  verifyStructuredContentPersistence,
} from './structure-content-queries.js';

export type MigrationReasonBreakdown = {
  copiedToNewField: number;
  alreadyHadTargetValue: number;
  sourceEmpty: number;
  noEffectiveChange: number;
  sourceCleaned: number;
};

export type MigrationStats = {
  scanned: number;
  migrated: number;
  unchanged: number;
  failed: number;
  dryRun: boolean;
  articleKeys: string[];
  reasonBreakdown: MigrationReasonBreakdown;
};

type MigrationFailure = {
  contentId: string;
  articleKey: string;
  message: string;
};

type LocalizedContentSnapshots = Map<string, StructuredContentRow>;

export async function runStructureMigration(
  config: AppConfig,
  structureKey: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    gateway: LiferayGateway;
    dryRun: boolean;
    cleanupSource: boolean;
    sourceSnapshots?: Map<string, LocalizedContentSnapshots>;
    printer?: Printer;
    fetchStructureByKeyFn: (
      config: AppConfig,
      gateway: LiferayGateway,
      siteId: number,
      key: string,
    ) => Promise<StructureLookup | null>;
  },
): Promise<MigrationStats> {
  const planData = await readMigrationPlanData(migrationPlanPath);

  options.printer?.info(
    `Migrating structure content: resolving structure definition and selecting targeted content...`,
  );
  const structure = await options.fetchStructureByKeyFn(config, options.gateway, siteId, structureKey);
  if (!structure?.id) {
    throw LiferayErrors.resourceError(`Could not resolve structure ${structureKey}`);
  }

  const runtimeDefinitionFields = await fetchStructureDefinitionFields(options.gateway, String(structure.id));

  const selected = await selectStructureContents(options.gateway, siteId, String(structure.id), planData);
  options.printer?.info(
    `Found ${selected.length} content item(s) matching migration criteria; processing migrations...`,
  );

  const migratedArticleKeys = new Set<string>();
  const failures: MigrationFailure[] = [];
  const stats: MigrationStats = {
    scanned: 0,
    migrated: 0,
    unchanged: 0,
    failed: 0,
    dryRun: options.dryRun,
    articleKeys: [],
    reasonBreakdown: {
      copiedToNewField: 0,
      alreadyHadTargetValue: 0,
      sourceEmpty: 0,
      noEffectiveChange: 0,
      sourceCleaned: 0,
    },
  };

  const progressInterval = 10; // Print progress every 10 items

  for (const item of selected) {
    stats.scanned += 1;
    if (options.printer && selected.length > progressInterval && (stats.scanned - 1) % progressInterval === 0) {
      options.printer.info(
        `Migrating content: ${stats.scanned}/${selected.length} scanned (${stats.migrated} migrated, ${stats.unchanged} unchanged, ${stats.failed} failed)`,
      );
    }
    try {
      const contentId = String(item.id ?? '');
      const articleKey = String(item.key ?? '').trim();
      const before = await fetchStructuredContentForMigration(options.gateway, contentId);
      const sourceSnapshots = options.sourceSnapshots?.get(contentId);
      const locales = resolveMigrationLocales(before, sourceSnapshots);
      const localizedSnapshots = new Map<string, StructuredContentRow>();
      for (const locale of locales) {
        localizedSnapshots.set(
          locale,
          locale === '' ? before : await fetchStructuredContentForMigration(options.gateway, contentId, locale),
        );
      }
      const titleI18n = buildTitleI18n(localizedSnapshots);
      let changedAcrossLocales = false;
      let sourceValueFound = false;
      let sourceValueMissing = false;
      let targetValueAlreadyPresent = false;
      let copiedToTarget = false;
      let sourceCleaned = false;
      let noEffectiveChange = false;

      for (const locale of locales) {
        const beforeLocalized = localizedSnapshots.get(locale) ?? before;
        const source = sourceSnapshots?.get(locale) ?? beforeLocalized;
        const after = structuredClone(beforeLocalized);
        const diagnostics = applyMappings(after, source, planData.rules, options.cleanupSource);
        sourceValueFound = sourceValueFound || diagnostics.sourceWithValue > 0;
        sourceValueMissing = sourceValueMissing || diagnostics.sourceEmpty > 0;
        targetValueAlreadyPresent = targetValueAlreadyPresent || diagnostics.targetAlreadySet > 0;
        copiedToTarget = copiedToTarget || diagnostics.targetWritten > 0;
        sourceCleaned = sourceCleaned || diagnostics.sourceCleaned > 0;

        if (!diagnostics.changed) {
          continue;
        }

        if (contentFieldsEqual(beforeLocalized, after)) {
          noEffectiveChange = true;
          continue;
        }
        changedAcrossLocales = true;

        if (!options.dryRun) {
          const payload = copyIfPresent(after, [
            'contentStructureId',
            'structuredContentFolderId',
            'friendlyUrlPath',
            'title',
            'contentFields',
          ]);
          if (payload.contentFields !== undefined) {
            payload.contentFields = toApiContentFields(payload.contentFields, runtimeDefinitionFields);
          }
          if (Object.keys(titleI18n).length > 0) {
            payload.title_i18n = titleI18n;
          }
          await options.gateway.putJson(
            `/o/headless-delivery/v1.0/structured-contents/${encodeURIComponent(contentId)}`,
            payload,
            'structure-migrate update',
            locale !== '' ? {headers: {'Accept-Language': locale}} : undefined,
          );
          await verifyStructuredContentPersistence(options.gateway, contentId, after, runtimeDefinitionFields, locale);
        }
      }

      if (!changedAcrossLocales) {
        stats.unchanged += 1;

        if (targetValueAlreadyPresent && !copiedToTarget) {
          stats.reasonBreakdown.alreadyHadTargetValue += 1;
        } else if (!sourceValueFound && sourceValueMissing) {
          stats.reasonBreakdown.sourceEmpty += 1;
        } else if (noEffectiveChange) {
          stats.reasonBreakdown.noEffectiveChange += 1;
        } else if (sourceValueMissing) {
          stats.reasonBreakdown.sourceEmpty += 1;
        } else {
          stats.reasonBreakdown.noEffectiveChange += 1;
        }
        continue;
      }

      stats.migrated += 1;
      if (copiedToTarget) {
        stats.reasonBreakdown.copiedToNewField += 1;
      }
      if (sourceCleaned) {
        stats.reasonBreakdown.sourceCleaned += 1;
      }
      if (articleKey !== '') {
        migratedArticleKeys.add(articleKey);
      }
    } catch (error) {
      stats.failed += 1;
      failures.push({
        contentId: String(item.id ?? ''),
        articleKey: String(item.key ?? '').trim(),
        message: error instanceof Error ? error.message : 'Unknown content migration error',
      });
    }
  }

  stats.articleKeys = [...migratedArticleKeys].sort();

  options.printer?.info(
    `Migration phase complete: ${stats.migrated} updated, ${stats.unchanged} unchanged, ${stats.failed} failed out of ${stats.scanned} total (${options.dryRun ? 'dry-run' : 'persisted'})`,
  );

  if (failures.length > 0) {
    const summary = failures
      .map(({contentId, articleKey, message}) => `${articleKey || contentId}: ${message}`)
      .join('; ');
    throw LiferayErrors.resourceError(`Structure migration failed for ${failures.length} content item(s): ${summary}`, {
      details: {stats, failures},
    });
  }

  return stats;
}

export async function captureMigrationSourceSnapshots(
  config: AppConfig,
  structureId: string,
  siteId: number,
  migrationPlanPath: string,
  options: {
    gateway: LiferayGateway;
  },
): Promise<Map<string, LocalizedContentSnapshots>> {
  const planData = await readMigrationPlanData(migrationPlanPath);
  const selected = await selectStructureContents(options.gateway, siteId, structureId, planData);
  const snapshots = new Map<string, LocalizedContentSnapshots>();
  for (const item of selected) {
    const contentId = String(item.id ?? '').trim();
    if (contentId === '') {
      continue;
    }
    const baseSnapshot = await fetchStructuredContentForMigration(options.gateway, contentId);
    const localizedSnapshots: LocalizedContentSnapshots = new Map();
    for (const locale of resolveMigrationLocales(baseSnapshot)) {
      localizedSnapshots.set(
        locale,
        locale === '' ? baseSnapshot : await fetchStructuredContentForMigration(options.gateway, contentId, locale),
      );
    }
    snapshots.set(contentId, localizedSnapshots);
  }
  return snapshots;
}

function resolveMigrationLocales(content: StructuredContentRow, snapshots?: LocalizedContentSnapshots): string[] {
  const fromSnapshots = snapshots ? [...snapshots.keys()].filter(Boolean) : [];
  if (fromSnapshots.length > 0) {
    return fromSnapshots.sort();
  }

  const availableLanguages = parseStringList(content.availableLanguages);
  if (availableLanguages.length > 0) {
    return availableLanguages.sort();
  }

  return [''];
}

function buildTitleI18n(localizedSnapshots: Map<string, StructuredContentRow>): Record<string, string> {
  const titles: Record<string, string> = {};

  for (const [locale, snapshot] of localizedSnapshots) {
    const normalizedLocale = locale.trim();
    if (normalizedLocale === '') {
      continue;
    }

    const title = normalizeScalarString(snapshot.title) ?? '';
    if (title === '') {
      continue;
    }

    titles[normalizedLocale] = title;
  }

  return titles;
}
