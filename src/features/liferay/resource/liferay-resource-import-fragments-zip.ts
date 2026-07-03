import fs from 'fs-extra';
import JSZip from 'jszip';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {createLiferayApiClient} from '../../../core/http/client.js';
import {formatProcessError} from '../../../core/platform/process.js';
import {runDockerCompose, runDockerComposeOrThrow} from '../../../core/platform/docker.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import {resolveSiteToken} from '../portal/artifact-paths.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import type {
  LiferayResourceImportFragmentItemResult,
  LiferayResourceImportFragmentsSingleResult,
  LocalFragment,
  LocalFragmentCollection,
  LocalFragmentsProject,
} from './liferay-resource-import-fragments-types.js';

export type FragmentZipDeployOptions = {
  groupId: number;
  groupKey: string;
  companyId?: number;
  project: LocalFragmentsProject;
  projectDir: string;
  siteFriendlyUrl: string;
};

export async function deployFragmentsProjectZip(
  config: AppConfig,
  options: FragmentZipDeployOptions,
  dependencies?: ResourceDependencies,
): Promise<LiferayResourceImportFragmentsSingleResult> {
  if (!config.repoRoot || !config.dockerDir) {
    throw LiferayErrors.resourceError('deploy-zip fragment import requires a project with docker/.');
  }

  const zipPath = await createAutoDeployFragmentsZip(config, options, dependencies);
  await copyZipToLiferayDeploy(config, zipPath);

  const fragmentResults = toZipFragmentResults(options.project.collections);

  return {
    mode: 'auto-deploy-zip-import',
    site: options.siteFriendlyUrl,
    siteId: options.groupId,
    projectDir: options.projectDir,
    zipPath,
    summary: {
      importedFragments: fragmentResults.length,
      fragmentResults: fragmentResults.length,
      pageTemplateResults: 0,
      errors: 0,
    },
    fragmentResults,
    pageTemplateResults: [],
  };
}

async function createAutoDeployFragmentsZip(
  config: AppConfig,
  options: FragmentZipDeployOptions,
  dependencies?: ResourceDependencies,
): Promise<string> {
  const zip = new JSZip();

  for (const collection of options.project.collections) {
    addCollectionToZip(zip, collection);
  }

  const companyWebId = await resolveCompanyWebId(config, options.companyId, dependencies);
  const deployDescriptor = companyWebId ? {companyWebId, groupKey: options.groupKey} : {groupKey: options.groupKey};

  zip.file('liferay-deploy-fragments.json', `${JSON.stringify(deployDescriptor, null, 2)}\n`);

  const outputDir = path.join(config.repoRoot ?? options.projectDir, '.ldev', 'tmp', 'fragments');
  await fs.ensureDir(outputDir);

  const siteToken = resolveSiteToken(options.siteFriendlyUrl);
  const zipPath = path.join(outputDir, `${siteToken}-fragments.zip`);
  const content = await zip.generateAsync({type: 'nodebuffer'});
  await fs.writeFile(zipPath, content);
  return zipPath;
}

async function resolveCompanyWebId(
  config: AppConfig,
  companyId: number | undefined,
  dependencies?: ResourceDependencies,
): Promise<string | null> {
  if (!companyId || companyId <= 0) {
    return null;
  }

  const apiClient = dependencies?.apiClient ?? createLiferayApiClient();
  const gateway = createLiferayGateway(config, apiClient, dependencies?.tokenClient);
  const response = await gateway.getRaw<{webId?: string}>(
    `/api/jsonws/company/get-company-by-id?companyId=${companyId}`,
  );

  if (!response.ok) {
    return null;
  }

  const webId = response.data?.webId?.trim() ?? '';
  return webId === '' ? null : webId;
}

function addCollectionToZip(zip: JSZip, collection: LocalFragmentCollection): void {
  const collectionDir = zip.folder(collection.slug);
  if (!collectionDir) {
    throw LiferayErrors.resourceError(`Could not create fragment set ${collection.slug} in ZIP.`);
  }

  collectionDir.file(
    'collection.json',
    `${JSON.stringify(
      {
        description: collection.description,
        name: collection.name,
      },
      null,
      2,
    )}\n`,
  );

  for (const fragment of collection.fragments) {
    addFragmentToZip(collectionDir, fragment);
  }
}

function addFragmentToZip(collectionDir: JSZip, fragment: LocalFragment): void {
  const fragmentDir = collectionDir.folder(fragment.slug);
  if (!fragmentDir) {
    throw LiferayErrors.resourceError(`Could not create fragment ${fragment.slug} in ZIP.`);
  }

  fragmentDir.file(
    'fragment.json',
    `${JSON.stringify(
      {
        configurationPath: fragment.configurationPath,
        cssPath: fragment.cssPath,
        htmlPath: fragment.htmlPath,
        icon: fragment.icon,
        jsPath: fragment.jsPath,
        name: fragment.name,
        type: fragment.type === 1 ? 'section' : 'component',
      },
      null,
      2,
    )}\n`,
  );
  fragmentDir.file(fragment.configurationPath, `${fragment.configuration}\n`);
  fragmentDir.file(fragment.htmlPath, fragment.html);
  fragmentDir.file(fragment.cssPath, fragment.css);
  fragmentDir.file(fragment.jsPath, fragment.js);
}

async function copyZipToLiferayDeploy(config: AppConfig, zipPath: string): Promise<void> {
  const serviceResult = await runDockerCompose(config.dockerDir!, ['ps', '-q', 'liferay']);
  if (!serviceResult.ok || serviceResult.stdout.trim() === '') {
    throw LiferayErrors.resourceError(
      formatProcessError(serviceResult, 'Could not resolve the running liferay container with docker compose.'),
    );
  }

  const fileName = path.basename(zipPath);
  const tmpTarget = `/tmp/${fileName}`;

  await runDockerComposeOrThrow(config.dockerDir!, ['cp', zipPath, `liferay:${tmpTarget}`]);
  await runDockerComposeOrThrow(config.dockerDir!, [
    'exec',
    '-T',
    '-u',
    'root',
    'liferay',
    'sh',
    '-lc',
    `chown liferay:liferay ${shellQuote(tmpTarget)} && mv ${shellQuote(tmpTarget)} ${shellQuote(
      `/opt/liferay/deploy/${fileName}`,
    )}`,
  ]);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function toZipFragmentResults(collections: LocalFragmentCollection[]): LiferayResourceImportFragmentItemResult[] {
  return collections.flatMap((collection) =>
    collection.fragments.map((fragment) => ({
      collection: collection.slug,
      fragment: fragment.slug,
      status: 'imported' as const,
    })),
  );
}
