/**
 * Checks that the local runtime matches the configured Liferay image:
 * Elasticsearch server + connector PID, host JDK, and the activation key.
 */

import path from 'node:path';

import fs from 'fs-extra';

import {readActivationKeyInfo} from '../../core/runtime/activation-key.js';
import {
  elasticsearchMajor,
  findConfiguredConnectors,
  resolveSearchEngineProfile,
} from '../../core/runtime/search-engine.js';
import type {DoctorCheck, DoctorContext} from './doctor-types.js';

const MIN_JDK_MAJOR = 21;

export function buildSearchEngineCheck(ctx: DoctorContext): DoctorCheck {
  const dockerEnv: Partial<Record<string, string>> = ctx.project.values.dockerEnv;
  const composeFiles = (dockerEnv.COMPOSE_FILE ?? '').split(/[:;]/).map((file) => path.basename(file.trim()));
  const base = {id: 'search-engine', label: 'Search engine', scope: 'runtime' as const};

  if (!composeFiles.includes('docker-compose.elasticsearch.yml')) {
    return {...base, status: 'pass', summary: 'no external Elasticsearch service in COMPOSE_FILE'};
  }

  const image = dockerEnv.LIFERAY_IMAGE;
  const expected = resolveSearchEngineProfile(image);
  const serverVersion = dockerEnv.ELASTICSEARCH_VERSION || readDockerfileElasticsearchVersion(ctx.repoPaths.dockerDir);
  const serverMajor = elasticsearchMajor(serverVersion ?? undefined);
  const expectedMajor = elasticsearchMajor(expected.elasticsearchVersion);
  const configsDir = ctx.repoPaths.liferayDir
    ? path.join(ctx.repoPaths.liferayDir, 'configs', 'dockerenv', 'osgi', 'configs')
    : null;
  const connectors = configsDir ? findConfiguredConnectors(configsDir) : [];

  const problems: string[] = [];
  if (serverMajor !== null && serverMajor !== expectedMajor) {
    problems.push(
      `Elasticsearch ${serverVersion} does not match ${image ?? 'the Liferay image'}; set ELASTICSEARCH_VERSION=${expected.elasticsearchVersion} in docker/.env.`,
    );
  }
  if (!connectors.includes(expected.connector)) {
    problems.push(
      `Missing ${expected.configPid}.config in liferay/configs/dockerenv/osgi/configs; Liferay falls back to its sidecar.`,
    );
  }
  if (
    configsDir &&
    connectors.includes(expected.connector) &&
    !isRemoteConnectorConfig(path.join(configsDir, `${expected.configPid}.config`), expected.connector)
  ) {
    problems.push(
      `${expected.configPid}.config does not enable the remote connection (${
        expected.connector === 'elasticsearch8' ? 'productionModeEnabled=B"true"' : 'operationMode="REMOTE"'
      }); Liferay starts its sidecar instead.`,
    );
  }
  const stale = connectors.filter((connector) => connector !== expected.connector);
  if (stale.length > 0) {
    problems.push(`Remove the ${stale.join(', ')} connector config: ${image ?? 'this image'} does not ship it.`);
  }

  return problems.length === 0
    ? {
        ...base,
        status: 'pass',
        summary: `Elasticsearch ${serverVersion ?? expected.elasticsearchVersion} with the ${expected.connector} connector`,
      }
    : {
        ...base,
        status: 'fail',
        summary: `search engine is misconfigured for ${image ?? 'the Liferay image'} (expects ${expected.connector}, Elasticsearch ${expected.elasticsearchVersion})`,
        details: problems,
        remedy: 'Run `ldev setup --with elasticsearch` to regenerate the connector config, then `ldev env recreate`.',
      };
}

export function buildJdkCheck(ctx: DoctorContext): DoctorCheck | null {
  const version = ctx.tools.java.available ? ctx.tools.java.version : null;
  const major = javaMajor(version);
  if (major === null) {
    return null;
  }

  return major >= MIN_JDK_MAJOR
    ? {id: 'jdk', label: 'JDK level', status: 'pass', summary: `JDK ${major} is suitable for DXP 2025+ builds`}
    : {
        id: 'jdk',
        label: 'JDK level',
        status: 'warn',
        summary: `JDK ${major} is older than the JDK ${MIN_JDK_MAJOR} that DXP 2025+ images run`,
        details: [`Use JDK ${MIN_JDK_MAJOR} for Gradle builds of modules, themes and client extensions.`],
      };
}

export function buildActivationKeyCheck(ctx: DoctorContext): DoctorCheck {
  const base = {id: 'activation-key', label: 'Activation Key'};
  const configured = ctx.activationKeyFile;

  if (configured && (!ctx.activationKeyExists || !ctx.activationKeyValidName)) {
    return {
      ...base,
      status: 'fail',
      summary: ctx.activationKeyExists
        ? `activation key file name is invalid: ${path.basename(configured)}`
        : `activation key file does not exist: ${configured}`,
      details: ['Point `LDEV_ACTIVATION_KEY_FILE` to a readable `activation-key-*.xml` outside the repository.'],
    };
  }

  const keyFile = configured ?? ctx.activationKeyInstalledFile;
  if (!keyFile) {
    return {
      ...base,
      status: 'warn',
      summary: 'LDEV_ACTIVATION_KEY_FILE is not configured; DXP users must pass a valid activation key before start',
      details: [
        'Set `LDEV_ACTIVATION_KEY_FILE` in your shell or docker/.env, or pass `ldev start --activation-key-file /path/to/activation-key-*.xml`.',
      ],
    };
  }

  const info = readActivationKeyInfo(keyFile);
  if (!info) {
    return {...base, status: 'fail', summary: `activation key is not a readable license XML: ${keyFile}`};
  }
  if (info.expired) {
    return {
      ...base,
      status: 'fail',
      summary: `activation key expired on ${info.expirationDate ?? 'an unknown date'}: ${keyFile}`,
    };
  }

  const description = `${info.licenseType ?? 'license'} for ${info.productVersion ?? 'DXP'}, expires ${info.expirationDate ?? 'unknown'}`;
  if (!configured && isInsideSourceTree(ctx, keyFile)) {
    return {
      ...base,
      status: 'warn',
      summary: `activation key found inside the repository (${keyFile}); ${description}`,
      details: [
        'Move the key outside the repository and set `LDEV_ACTIVATION_KEY_FILE`; `ldev start` installs it into the generated build configs.',
      ],
    };
  }

  return {...base, status: 'pass', summary: `activation key ready (${description}) at ${keyFile}`};
}

function isInsideSourceTree(ctx: DoctorContext, file: string): boolean {
  const liferayDir = ctx.repoPaths.liferayDir;
  if (!liferayDir) {
    return false;
  }
  const relative = path.relative(path.join(liferayDir, 'configs'), file);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function readDockerfileElasticsearchVersion(dockerDir: string | null): string | null {
  if (!dockerDir) {
    return null;
  }
  try {
    const dockerfile = fs.readFileSync(path.join(dockerDir, 'elasticsearch', 'Dockerfile'), 'utf8');
    return (
      /ARG ELASTICSEARCH_VERSION=(\S+)/.exec(dockerfile)?.[1] ??
      /FROM \S*elasticsearch:(\d[\w.-]*)/.exec(dockerfile)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

/** The elasticsearch8 connector ignores operationMode; only productionModeEnabled leaves the sidecar. */
function isRemoteConnectorConfig(file: string, connector: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  return connector === 'elasticsearch8'
    ? /^productionModeEnabled\s*=\s*B"true"/m.test(content)
    : /^operationMode\s*=\s*"REMOTE"/m.test(content) || /^productionModeEnabled\s*=\s*B"true"/m.test(content);
}

/** Accepts `21.0.13`, `1.8.0_402` or `openjdk version "21.0.13" 2026-10-20`. */
function javaMajor(version: string | null): number | null {
  const match = /(?:^|version\s+"?)(?:1\.)?(\d+)(?:[._]|"|$)/.exec(version ?? '');
  return match ? Number(match[1]) : null;
}
