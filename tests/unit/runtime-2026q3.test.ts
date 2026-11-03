import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {readActivationKeyInfo} from '../../src/core/runtime/activation-key.js';
import {
  connectorConfigPid,
  resolveSearchEngineProfile,
  writeElasticsearchConnectorConfig,
} from '../../src/core/runtime/search-engine.js';
import {buildJdkCheck, buildSearchEngineCheck} from '../../src/features/doctor/doctor-runtime-checks.js';
import type {DoctorContext} from '../../src/features/doctor/doctor-types.js';
import {resolveActivationKeySource} from '../../src/features/env/env-activation-key.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const ES_COMPOSE = 'docker-compose.yml:docker-compose.elasticsearch.yml';

function doctorContext(options: {
  dockerEnv: Record<string, string>;
  liferayDir?: string;
  dockerDir?: string;
  javaVersion?: string | null;
}): DoctorContext {
  return {
    project: {values: {dockerEnv: options.dockerEnv}},
    repoPaths: {liferayDir: options.liferayDir ?? null, dockerDir: options.dockerDir ?? null},
    tools: {java: {available: options.javaVersion !== null, version: options.javaVersion ?? null}},
  } as unknown as DoctorContext;
}

async function liferayWithConnector(connector: 'elasticsearch7' | 'elasticsearch8', content: string): Promise<string> {
  const liferayDir = path.join(createTempDir('ldev-runtime-'), 'liferay');
  const configsDir = path.join(liferayDir, 'configs', 'dockerenv', 'osgi', 'configs');
  await fs.ensureDir(configsDir);
  await fs.writeFile(path.join(configsDir, `${connectorConfigPid(connector)}.config`), content);
  return liferayDir;
}

describe('search engine profile', () => {
  test.each([
    ['liferay/dxp:2025.q1.17-lts', 'elasticsearch7', '7.17.26'],
    ['liferay/dxp:2025.q4.12', 'elasticsearch7', '7.17.26'],
    ['liferay/dxp:2026.q1.14-lts', 'elasticsearch8', '8.19.0'],
    ['dxp-2026.q3.9', 'elasticsearch8', '8.19.0'],
    ['liferay/portal:7.4.3.132-ga132', 'elasticsearch7', '7.17.26'],
    [undefined, 'elasticsearch7', '7.17.26'],
  ])('%s -> %s', (image, connector, version) => {
    expect(resolveSearchEngineProfile(image)).toEqual({
      connector,
      elasticsearchVersion: version,
      configPid: `com.liferay.portal.search.${connector}.configuration.ElasticsearchConfiguration`,
    });
  });

  test('writes the connector config for the image and removes the other PID', async () => {
    const configsDir = createTempDir('ldev-es-configs-');
    await fs.writeFile(
      path.join(configsDir, `${connectorConfigPid('elasticsearch7')}.config`),
      'operationMode="REMOTE"',
    );

    await writeElasticsearchConnectorConfig(configsDir, resolveSearchEngineProfile('liferay/dxp:2026.q3.9'));

    expect(await fs.readdir(configsDir)).toEqual([`${connectorConfigPid('elasticsearch8')}.config`]);
    const content = await fs.readFile(path.join(configsDir, `${connectorConfigPid('elasticsearch8')}.config`), 'utf8');
    expect(content).toContain('productionModeEnabled=B"true"');
    expect(content).toContain('networkHostAddresses=["http://elasticsearch:9200"]');
    expect(content).not.toContain('operationMode');
  });
});

describe('doctor runtime checks', () => {
  test('passes when the server, connector PID and remote mode match the image', async () => {
    const liferayDir = await liferayWithConnector('elasticsearch8', 'productionModeEnabled=B"true"\n');
    const check = buildSearchEngineCheck(
      doctorContext({
        dockerEnv: {COMPOSE_FILE: ES_COMPOSE, LIFERAY_IMAGE: 'liferay/dxp:2026.q3.9', ELASTICSEARCH_VERSION: '8.19.0'},
        liferayDir,
      }),
    );
    expect(check).toMatchObject({status: 'pass', summary: 'Elasticsearch 8.19.0 with the elasticsearch8 connector'});
  });

  test('fails on an ES 7 server and ES 7 connector for a 2026 image', async () => {
    const liferayDir = await liferayWithConnector('elasticsearch7', 'operationMode="REMOTE"\n');
    const dockerDir = createTempDir('ldev-docker-');
    await fs.outputFile(path.join(dockerDir, 'elasticsearch', 'Dockerfile'), 'FROM elasticsearch:7.17.26\n');

    const check = buildSearchEngineCheck(
      doctorContext({
        dockerEnv: {COMPOSE_FILE: ES_COMPOSE, LIFERAY_IMAGE: 'liferay/dxp:2026.q3.9'},
        liferayDir,
        dockerDir,
      }),
    );

    expect(check.status).toBe('fail');
    expect(check.details).toEqual([
      expect.stringContaining('Elasticsearch 7.17.26 does not match liferay/dxp:2026.q3.9'),
      expect.stringContaining('Missing com.liferay.portal.search.elasticsearch8'),
      expect.stringContaining('Remove the elasticsearch7 connector config'),
    ]);
  });

  test('fails when the elasticsearch8 config keeps operationMode, which starts the sidecar', async () => {
    const liferayDir = await liferayWithConnector('elasticsearch8', 'operationMode="REMOTE"\n');
    const check = buildSearchEngineCheck(
      doctorContext({
        dockerEnv: {COMPOSE_FILE: ES_COMPOSE, LIFERAY_IMAGE: 'liferay/dxp:2026.q3.9', ELASTICSEARCH_VERSION: '8.19.0'},
        liferayDir,
      }),
    );
    expect(check.status).toBe('fail');
    expect(check.details).toEqual([expect.stringContaining('sidecar')]);
  });

  test('passes without an external Elasticsearch service', () => {
    expect(buildSearchEngineCheck(doctorContext({dockerEnv: {LIFERAY_IMAGE: 'liferay/dxp:2026.q3.9'}})).status).toBe(
      'pass',
    );
  });

  test.each([
    ['openjdk version "21.0.13" 2026-10-20', 'pass'],
    ['17.0.9', 'warn'],
    ['1.8.0_402', 'warn'],
  ])('JDK %s -> %s', (javaVersion, status) => {
    expect(buildJdkCheck(doctorContext({dockerEnv: {}, javaVersion}))?.status).toBe(status);
  });
});

describe('activation key', () => {
  test('reads non-secret metadata and expiry', async () => {
    const dir = createTempDir('ldev-key-');
    const file = path.join(dir, 'activation-key-dev.xml');
    await fs.writeFile(
      file,
      '<license><license-type>developer</license-type><product-version>7.4</product-version>' +
        '<expiration-date>Sunday, August 17, 2121 10:56:59 PM GMT</expiration-date><key>secret</key></license>',
    );

    expect(readActivationKeyInfo(file, new Date('2026-11-03T00:00:00Z'))).toEqual({
      productVersion: '7.4',
      licenseType: 'developer',
      startDate: null,
      expirationDate: '2121-08-17T22:56:59.000Z',
      expired: false,
    });
    expect(readActivationKeyInfo(file, new Date('2122-01-01T00:00:00Z'))?.expired).toBe(true);

    await fs.writeFile(file, '<activation-key />');
    expect(readActivationKeyInfo(file)).toBeNull();
  });

  test('resolves the key from the flag, then the shell, then docker/.env', () => {
    const dockerEnv = {LDEV_ACTIVATION_KEY_FILE: '"/keys/activation-key-env.xml"'};

    expect(resolveActivationKeySource('/keys/activation-key-flag.xml', dockerEnv, {})).toBe(
      '/keys/activation-key-flag.xml',
    );
    expect(
      resolveActivationKeySource(undefined, dockerEnv, {LDEV_ACTIVATION_KEY_FILE: '/keys/activation-key-shell.xml'}),
    ).toBe('/keys/activation-key-shell.xml');
    expect(resolveActivationKeySource(undefined, dockerEnv, {})).toBe('/keys/activation-key-env.xml');
    expect(resolveActivationKeySource(undefined, {}, {})).toBeNull();
  });
});
