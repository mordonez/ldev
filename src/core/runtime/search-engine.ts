/**
 * Elasticsearch server and Liferay connector that match a Liferay image.
 *
 * Verified against the official images: DXP 2025.q1-q4 ship only the
 * elasticsearch7 connector; DXP 2026.q1 and later ship only elasticsearch8.
 */

import path from 'node:path';

import fs from 'fs-extra';

export type SearchConnector = 'elasticsearch7' | 'elasticsearch8';

export type SearchEngineProfile = {
  connector: SearchConnector;
  elasticsearchVersion: string;
  configPid: string;
};

const ELASTICSEARCH_VERSIONS: Record<SearchConnector, string> = {
  elasticsearch7: '7.17.26',
  elasticsearch8: '8.19.0',
};

const FIRST_ELASTICSEARCH8_YEAR = 2026;

export function connectorConfigPid(connector: SearchConnector): string {
  return `com.liferay.portal.search.${connector}.configuration.ElasticsearchConfiguration`;
}

/** Resolve from a Docker image (`liferay/dxp:2026.q3.9`) or release key (`dxp-2026.q1.14-lts`). */
export function resolveSearchEngineProfile(liferayImageOrRelease: string | undefined): SearchEngineProfile {
  const quarterly = /(\d{4})\.q\d/i.exec(liferayImageOrRelease ?? '');
  const connector: SearchConnector =
    quarterly && Number(quarterly[1]) >= FIRST_ELASTICSEARCH8_YEAR ? 'elasticsearch8' : 'elasticsearch7';

  return {
    connector,
    elasticsearchVersion: ELASTICSEARCH_VERSIONS[connector],
    configPid: connectorConfigPid(connector),
  };
}

/** Major version of an Elasticsearch version string, or null. */
export function elasticsearchMajor(version: string | undefined): number | null {
  const major = Number.parseInt(version ?? '', 10);
  return Number.isNaN(major) ? null : major;
}

/** Connector PIDs configured in an OSGi configs directory. */
export function findConfiguredConnectors(configsDir: string): SearchConnector[] {
  return (['elasticsearch7', 'elasticsearch8'] as const).filter((connector) =>
    fs.existsSync(path.join(configsDir, `${connectorConfigPid(connector)}.config`)),
  );
}

/**
 * Write the remote-Elasticsearch connector config under the PID the image
 * understands, removing the PID of the other connector.
 */
export async function writeElasticsearchConnectorConfig(
  configsDir: string,
  profile: SearchEngineProfile,
): Promise<string> {
  await fs.ensureDir(configsDir);
  for (const connector of ['elasticsearch7', 'elasticsearch8'] as const) {
    if (connector !== profile.connector) {
      await fs.remove(path.join(configsDir, `${connectorConfigPid(connector)}.config`));
    }
  }

  const file = path.join(configsDir, `${profile.configPid}.config`);
  await fs.writeFile(
    file,
    [
      `# Remote Elasticsearch ${profile.elasticsearchVersion} (docker-compose service "elasticsearch")`,
      profile.connector === 'elasticsearch8' ? 'productionModeEnabled=B"true"' : 'operationMode="REMOTE"',
      'networkHostAddresses=["http://elasticsearch:9200"]',
      'authenticationEnabled=B"false"',
      'httpSSLEnabled=B"false"',
      '',
    ].join('\n'),
  );
  return file;
}
