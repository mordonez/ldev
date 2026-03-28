import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import type {OAuthTokenClient} from '../../core/http/auth.js';
import type {LiferayApiClient} from '../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from './liferay-inventory-sites.js';
import {listFragmentCollections, listFragments, resolveResourceSite} from './liferay-resource-shared.js';
import {resolveFragmentsBaseDir, resolveRepoPath, resolveSiteToken} from './liferay-resource-paths.js';

type ResourceDependencies = {
  apiClient?: LiferayApiClient;
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
      outputDir: path.resolve(
        options?.dir?.trim() ? resolveRepoPath(config, options.dir) : resolveFragmentsBaseDir(config),
      ),
      scannedSites: siteResults.length,
      siteResults,
    };
  }

  const site = await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const siteToken = resolveSiteToken(site.friendlyUrlPath);
  const baseOutputDir = options?.dir?.trim()
    ? path.resolve(resolveRepoPath(config, options.dir))
    : path.join(resolveFragmentsBaseDir(config), 'sites', siteToken);
  const outputDir = path.resolve(baseOutputDir);
  const srcDir = path.join(outputDir, 'src');

  await fs.remove(srcDir);
  await fs.ensureDir(srcDir);

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

    const collectionKey =
      String(collection.fragmentCollectionKey ?? '').trim() ||
      sanitizeFileToken(String(collection.name ?? 'collection'));
    const collectionDir = path.join(srcDir, collectionKey);
    await fs.ensureDir(path.join(collectionDir, 'fragments'));
    await writeJson(path.join(collectionDir, 'collection.json'), {
      name: String(collection.name ?? collectionKey),
      description: String(collection.description ?? ''),
    });

    const fragments = await listFragments(config, collectionId, dependencies);
    let collectionHasFragments = false;
    for (const fragment of fragments) {
      if (options?.fragment) {
        const fragmentKey = String(fragment.fragmentEntryKey ?? '');
        const fragmentName = String(fragment.name ?? '');
        if (![fragmentKey, fragmentName].includes(options.fragment)) {
          continue;
        }
      }

      const fragmentKey =
        String(fragment.fragmentEntryKey ?? '').trim() || sanitizeFileToken(String(fragment.name ?? 'fragment'));
      const fragmentDir = path.join(collectionDir, 'fragments', fragmentKey);
      await fs.ensureDir(fragmentDir);
      await fs.writeFile(path.join(fragmentDir, 'index.html'), String(fragment.html ?? ''));
      await fs.writeFile(path.join(fragmentDir, 'index.css'), String(fragment.css ?? ''));
      await fs.writeFile(path.join(fragmentDir, 'index.js'), String(fragment.js ?? ''));

      const rawConfiguration = String(fragment.configuration ?? '').trim();
      if (rawConfiguration !== '') {
        try {
          const parsedConfiguration = JSON.parse(rawConfiguration) as Record<string, unknown>;
          await writeJson(path.join(fragmentDir, 'configuration.json'), {
            ...parsedConfiguration,
            fieldSets: Array.isArray(parsedConfiguration.fieldSets)
              ? parsedConfiguration.fieldSets
              : defaultFragmentConfiguration().fieldSets,
          });
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

      collectionHasFragments = true;
      fragmentCount += 1;
    }

    if (collectionHasFragments) {
      collectionCount += 1;
    } else {
      await fs.remove(collectionDir);
    }
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

function sanitizeFileToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
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
