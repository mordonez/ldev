import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {runLiferayResourceLintPageDefinition} from '../../src/features/liferay/resource/liferay-resource-lint-page-definition.js';
import {getLiferayResourceLintExitCode} from '../../src/features/liferay/resource/liferay-resource-lint-shared.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

async function writeFile(dir: string, relativePath: string, content: string): Promise<string> {
  const filePath = path.join(dir, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  return filePath;
}

const VALID_PAGE_DEFINITION = JSON.stringify({
  pageElement: {
    type: 'Root',
    pageElements: [
      {
        type: 'Fragment',
        fragmentEntryLinkId: '1',
      },
    ],
  },
});

describe('resource lint-page-definition', () => {
  test('passes a well-formed page-definition.json with type Root', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-good-');
    await writeFile(dir, 'layouts/news/page-definition.json', VALID_PAGE_DEFINITION);

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(getLiferayResourceLintExitCode(result)).toBe(0);
  });

  test('flags a missing "type": "Root" on the top-level pageElement', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-missing-root-');
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify({pageElement: {pageElements: []}}));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(false);
    expect(getLiferayResourceLintExitCode(result)).toBe(1);
    expect(result.findings).toContainEqual(expect.objectContaining({rule: 'missing-root-type', severity: 'error'}));
  });

  test('flags a wholly missing pageElement object', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-missing-element-');
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify({name: 'News'}));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({rule: 'missing-page-element', severity: 'error'}));
  });

  test('flags invalid JSON content', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-invalid-json-');
    await writeFile(dir, 'layouts/news/page-definition.json', '{not valid json');

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({rule: 'invalid-json', severity: 'error'}));
  });

  test('warns on capitalized "Title" fieldKey mistaken for the reserved lowercase "title"', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-title-case-');
    const pageDefinition = {
      pageElement: {
        type: 'Root',
        pageElements: [
          {
            type: 'Fragment',
            fragmentFields: [
              {
                id: 'news-card-title',
                value: {
                  text: {
                    mapping: {
                      fieldKey: 'Title',
                      itemReference: {contextSource: 'CollectionItem'},
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    };
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify(pageDefinition));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.summary.warnings).toBeGreaterThan(0);
    expect(result.findings).toContainEqual(
      expect.objectContaining({rule: 'miscased-reserved-field-key', severity: 'warning'}),
    );
  });

  test('does not flag the correct lowercase "title" fieldKey', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-title-lowercase-');
    const pageDefinition = {
      pageElement: {
        type: 'Root',
        pageElements: [
          {
            type: 'Fragment',
            fragmentFields: [
              {
                id: 'news-card-title',
                value: {text: {mapping: {fieldKey: 'title'}}},
              },
            ],
          },
        ],
      },
    };
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify(pageDefinition));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  test('warns when numberOfItems is lower than numberOfItemsPerPage', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-collection-cap-');
    const pageDefinition = {
      pageElement: {
        type: 'Root',
        pageElements: [
          {
            type: 'Collection',
            config: {numberOfItems: 1, numberOfItemsPerPage: 9},
          },
        ],
      },
    };
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify(pageDefinition));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.summary.warnings).toBeGreaterThan(0);
    expect(result.findings).toContainEqual(
      expect.objectContaining({rule: 'collection-number-of-items-cap', severity: 'warning'}),
    );
  });

  test('does not flag numberOfItems equal to numberOfItemsPerPage', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-collection-cap-ok-');
    const pageDefinition = {
      pageElement: {
        type: 'Root',
        pageElements: [
          {
            type: 'Collection',
            config: {numberOfItems: 9, numberOfItemsPerPage: 9},
          },
        ],
      },
    };
    await writeFile(dir, 'layouts/news/page-definition.json', JSON.stringify(pageDefinition));

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  test('warns on a ddm-structures field name colliding with a reserved Info Item field', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-ddm-reserved-');
    const xml = `<?xml version="1.0"?>
<root available-languages="en_US" default-languageId="en_US">
  <dynamic-element dataType="string" name="authorName" type="text" index-type="">
    <meta-data locale="en_US"><entry name="label">Author</entry></meta-data>
  </dynamic-element>
</root>
`;
    await writeFile(dir, 'ddm-structures/news.xml', xml);

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.summary.warnings).toBeGreaterThan(0);
    expect(result.findings).toContainEqual(
      expect.objectContaining({rule: 'reserved-info-item-field-name', severity: 'warning'}),
    );
  });

  test('does not flag a non-reserved ddm-structures field name', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-ddm-ok-');
    const xml = `<?xml version="1.0"?>
<root available-languages="en_US" default-languageId="en_US">
  <dynamic-element dataType="string" name="authorFullName" type="text" index-type="">
    <meta-data locale="en_US"><entry name="label">Author</entry></meta-data>
  </dynamic-element>
</root>
`;
    await writeFile(dir, 'ddm-structures/news.xml', xml);

    const result = await runLiferayResourceLintPageDefinition({dir});

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  test('lints a single --file target directly', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-single-file-');
    const file = await writeFile(dir, 'page-definition.json', JSON.stringify({pageElement: {pageElements: []}}));

    const result = await runLiferayResourceLintPageDefinition({file});

    expect(result.target).toBe(path.resolve(file));
    expect(result.filesScanned).toBe(1);
    expect(result.ok).toBe(false);
  });

  test('throws when the directory has no page-definition.json or ddm-structures xml', async () => {
    const dir = createTempDir('dev-cli-lint-page-definition-empty-');

    await expect(runLiferayResourceLintPageDefinition({dir})).rejects.toThrow(/No page-definition.json/);
  });
});
