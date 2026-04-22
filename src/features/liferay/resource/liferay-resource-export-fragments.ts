import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../../core/http/auth.js';
import type {HttpApiClient} from '../../../core/http/client.js';
import {isRecord, parseJsonUnknown} from '../../../core/utils/json.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {listFragmentCollections, listFragments, resolveResourceSite} from './liferay-resource-shared.js';
import {resolveSiteToken} from './liferay-resource-paths.js';
import {resolveArtifactBaseDir, resolveArtifactSiteDir, sanitizeArtifactToken} from './artifact-paths.js';

type ResourceDependencies = {
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type LiferayResourceExportFragmentsResult = {
  mode?: 'all-sites';
  site: string;
  siteToken: string;
  collectionCount: number;
  fragmentCount: number;
  outputDir: string;
  scannedSites?: number;
  siteResults?: LiferayResourceExportFragmentsResult[];
};

export async function runLiferayResourceExportFragments(
  config: AppConfig,
  options?: {site?: string; dir?: string; allSites?: boolean; collection?: string; fragment?: string},
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceExportFragmentsResult> {
  if (options?.allSites) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
    const siteResults: LiferayResourceExportFragmentsResult[] = [];
    let collectionCount = 0;
    let fragmentCount = 0;

    for (const site of sites) {
      const result = await runLiferayResourceExportFragments(
        config,
        {
          site: site.siteFriendlyUrl,
          dir: options.dir,
          collection: options.collection,
          fragment: options.fragment,
        },
        dependencies,
      );
      siteResults.push(result);
      collectionCount += result.collectionCount;
      fragmentCount += result.fragmentCount;
    }

    return {
      mode: 'all-sites',
      site: 'all-sites',
      siteToken: 'all-sites',
      collectionCount,
      fragmentCount,
      outputDir: resolveArtifactBaseDir(config, 'fragment', options.dir),
      scannedSites: siteResults.length,
      siteResults,
    };
  }

  const site = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const outputDir = resolveArtifactSiteDir(config, 'fragment', siteToken, options?.dir);
  const srcDir = path.join(outputDir, 'src');
  let initializedOutput = false;

  const collections = await listFragmentCollections(config, site.id, dependencies);
  let collectionCount = 0;
  let fragmentCount = 0;

  for (const collection of collections) {
    const collectionId = Number(collection.fragmentCollectionId ?? -1);
    if (collectionId <= 0) {
      continue;
    }
    if (options?.collection) {
      const collectionKey = String(collection.fragmentCollectionKey ?? '');
      const collectionName = String(collection.name ?? '');
      if (![collectionKey, collectionName].includes(options.collection)) {
        continue;
      }
    }

    const fragments = await listFragments(config, collectionId, dependencies);
    const filteredFragments = fragments.filter((fragment) => {
      if (!options?.fragment) {
        return true;
      }

      const fragmentKey = String(fragment.fragmentEntryKey ?? '');
      const fragmentName = String(fragment.name ?? '');
      return [fragmentKey, fragmentName].includes(options.fragment);
    });

    if (filteredFragments.length === 0) {
      continue;
    }

    if (!initializedOutput) {
      await fs.remove(srcDir);
      await fs.ensureDir(srcDir);
      initializedOutput = true;
    }

    const collectionKey =
      String(collection.fragmentCollectionKey ?? '').trim() ||
      sanitizeArtifactToken(String(collection.name ?? 'collection'));
    const collectionDir = path.join(srcDir, collectionKey);
    await fs.ensureDir(path.join(collectionDir, 'fragments'));
    await writeJson(path.join(collectionDir, 'collection.json'), {
      name: String(collection.name ?? collectionKey),
      description: String(collection.description ?? ''),
    });

    for (const fragment of filteredFragments) {
      const fragmentKey =
        String(fragment.fragmentEntryKey ?? '').trim() || sanitizeArtifactToken(String(fragment.name ?? 'fragment'));
      const fragmentDir = path.join(collectionDir, 'fragments', fragmentKey);
      await fs.ensureDir(fragmentDir);
      await fs.writeFile(path.join(fragmentDir, 'index.html'), String(fragment.html ?? ''));
      await fs.writeFile(path.join(fragmentDir, 'index.css'), String(fragment.css ?? ''));
      await fs.writeFile(path.join(fragmentDir, 'index.js'), String(fragment.js ?? ''));

      const rawConfiguration = String(fragment.configuration ?? '').trim();
      if (rawConfiguration !== '') {
        try {
          const parsedConfiguration = parseJsonUnknown(rawConfiguration);
          await writeJson(
            path.join(fragmentDir, 'configuration.json'),
            isRecord(parsedConfiguration)
              ? {
                  ...parsedConfiguration,
                  fieldSets: Array.isArray(parsedConfiguration.fieldSets)
                    ? parsedConfiguration.fieldSets
                    : defaultFragmentConfiguration().fieldSets,
                }
              : defaultFragmentConfiguration(),
          );
        } catch {
          await writeJson(path.join(fragmentDir, 'configuration.json'), defaultFragmentConfiguration());
        }
      } else {
        await writeJson(path.join(fragmentDir, 'configuration.json'), defaultFragmentConfiguration());
      }

      await writeJson(path.join(fragmentDir, 'fragment.json'), {
        configurationPath: 'configuration.json',
        jsPath: 'index.js',
        htmlPath: 'index.html',
        cssPath: 'index.css',
        icon: String(fragment.icon ?? 'code'),
        name: String(fragment.name ?? fragmentKey),
        type: Number(fragment.type ?? 0) === 1 ? 'section' : 'component',
      });
      fragmentCount += 1;
    }
    collectionCount += 1;
  }

  return {
    site: site.friendlyUrlPath,
    siteToken,
    collectionCount,
    fragmentCount,
    outputDir,
  };
}

export function formatLiferayResourceExportFragments(result: LiferayResourceExportFragmentsResult): string {
  if (result.mode === 'all-sites') {
    return `collections=${result.collectionCount} fragments=${result.fragmentCount} scanned=${result.scannedSites ?? 0} mode=all-sites dir=${result.outputDir}`;
  }

  return `collections=${result.collectionCount} fragments=${result.fragmentCount} dir=${result.outputDir}`;
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function defaultFragmentConfiguration(): {fieldSets: Array<{fields: Array<Record<string, string>>}>} {
  return {
    fieldSets: [
      {
        fields: [
          {
            dataType: 'object',
            label: 'text-color',
            name: 'textColor',
            type: 'colorPalette',
          },
        ],
      },
    ],
  };
}
