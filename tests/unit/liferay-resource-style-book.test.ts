import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {createLiferayApiClient} from '../../src/core/http/client.js';
import {
  diffStyleBook,
  runLiferayResourceExportStyleBook,
  runLiferayResourceImportStyleBook,
} from '../../src/features/liferay/resource/liferay-resource-style-book.js';
import {createStaticTokenClient, createTestFetchImpl, toTestRequestBody} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

type Entry = {
  styleBookEntryId: number;
  externalReferenceCode: string;
  name: string;
  styleBookEntryKey: string;
  themeId: string;
  frontendTokensValues: string;
};

function config(repoRoot: string) {
  return {
    cwd: repoRoot,
    repoRoot,
    dockerDir: null,
    liferayDir: path.join(repoRoot, 'liferay'),
    files: {dockerEnv: null, liferayProfile: null},
    liferay: {
      url: 'http://localhost:8080',
      oauth2ClientId: 'id',
      oauth2ClientSecret: 's',
      scopeAliases: '',
      timeoutSeconds: 5,
    },
  };
}

/** JSONWS stylebook.stylebookentry in /global (groupId 20); `failName` mimics the unique-name rule. */
function createStyleBookPortal(initial: Entry[], options: {ignoreTokenUpdates?: boolean} = {}) {
  const entries = [...initial];
  const calls: string[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body));
  const fetchImpl = createTestFetchImpl((url, init) => {
    const {pathname} = new URL(url);
    const form = new URLSearchParams(init?.body ? toTestRequestBody(init.body) : '');
    calls.push(pathname.split('/').at(-1) ?? pathname);
    if (pathname.includes('/sites/') || pathname.includes('/group/get-group')) {
      return json({id: 20, friendlyUrlPath: '/global', name: 'Global', companyId: 1});
    }
    if (pathname.endsWith('/get-style-book-entries')) {
      return json(entries);
    }
    if (pathname.endsWith('/add-style-book-entry')) {
      if (entries.some((entry) => entry.name === form.get('name'))) {
        return json({exception: 'Duplicate style book entry name'});
      }
      const entry = {
        styleBookEntryId: entries.length + 1,
        externalReferenceCode: form.get('externalReferenceCode') ?? '',
        name: form.get('name') ?? '',
        styleBookEntryKey: form.get('styleBookEntryKey') ?? '',
        themeId: form.get('themeId') ?? '',
        frontendTokensValues: form.get('frontendTokensValues') ?? '{}',
      };
      entries.push(entry);
      return json(entry);
    }
    const entry = entries.find((item) => String(item.styleBookEntryId) === form.get('styleBookEntryId'));
    if (pathname.endsWith('/update-frontend-tokens-values') && entry) {
      if (!options.ignoreTokenUpdates) {
        entry.frontendTokensValues = form.get('frontendTokensValues') ?? '{}';
      }
      return json(entry);
    }
    if (pathname.endsWith('/update-name') && entry) {
      entry.name = form.get('name') ?? '';
      return json(entry);
    }
    throw new Error(`Unexpected ${url}`);
  });
  return {
    entries,
    calls,
    dependencies: {apiClient: createLiferayApiClient({fetchImpl}), tokenClient: createStaticTokenClient()},
  };
}

const BRAND = {
  styleBookEntryId: 5,
  externalReferenceCode: 'UB_BRAND',
  name: 'UB Brand',
  styleBookEntryKey: 'ub-brand',
  themeId: 'classic_WAR_classictheme',
  frontendTokensValues: JSON.stringify({brandColor1: {cssVariableMapping: 'brand-color-1', value: '#003b71'}}),
};

describe('style books', () => {
  test('diff is per token: local declares, remote-only tokens are removals', () => {
    expect(
      diffStyleBook(
        {
          externalReferenceCode: 'X',
          name: 'X',
          styleBookEntryKey: 'x',
          themeId: 't',
          frontendTokensValues: {a: {value: 1}, b: {value: 2}},
        },
        {
          externalReferenceCode: 'X',
          name: 'Y',
          styleBookEntryKey: 'x',
          themeId: 't',
          frontendTokensValues: {a: {value: 9}, c: {value: 3}},
        },
      ),
    ).toEqual([
      {kind: 'change', path: 'name'},
      {kind: 'change', path: 'frontendTokensValues.a'},
      {kind: 'add', path: 'frontendTokensValues.b'},
      {kind: 'remove', path: 'frontendTokensValues.c'},
    ]);
  });

  test('exports to style-books/<site>/<erc>.json, then check-only, update and read-back', async () => {
    const repoRoot = createTempDir('ldev-sb-');
    const portal = createStyleBookPortal([{...BRAND}]);

    const {outputPath} = await runLiferayResourceExportStyleBook(
      config(repoRoot),
      {id: 'ub-brand'},
      portal.dependencies,
    );
    expect(outputPath).toBe(path.join(repoRoot, 'liferay', 'resources', 'style-books', 'global', 'UB_BRAND.json'));

    const file = (await fs.readJson(outputPath)) as {frontendTokensValues: {brandColor1: {value: string}}};
    file.frontendTokensValues.brandColor1.value = '#c8102e';
    await fs.writeJson(outputPath, file);

    const checked = await runLiferayResourceImportStyleBook(
      config(repoRoot),
      {key: 'UB_BRAND', checkOnly: true},
      portal.dependencies,
    );
    expect(checked).toMatchObject({
      status: 'checked',
      changes: [{kind: 'change', path: 'frontendTokensValues.brandColor1'}],
    });
    expect(portal.calls).not.toContain('update-frontend-tokens-values');

    const updated = await runLiferayResourceImportStyleBook(config(repoRoot), {key: 'UB_BRAND'}, portal.dependencies);
    expect(updated.status).toBe('updated');
    expect(JSON.parse(portal.entries[0].frontendTokensValues)).toEqual(file.frontendTokensValues);
  });

  test('fails the read-back when the portal did not keep the tokens', async () => {
    const repoRoot = createTempDir('ldev-sb-');
    const portal = createStyleBookPortal([{...BRAND}], {ignoreTokenUpdates: true});
    const file = path.join(repoRoot, 'brand.json');
    await fs.writeJson(file, {...BRAND, frontendTokensValues: {brandColor1: {value: '#fff'}}});

    await expect(runLiferayResourceImportStyleBook(config(repoRoot), {file}, portal.dependencies)).rejects.toThrow(
      /Read-back mismatch for style book 'UB_BRAND': change frontendTokensValues.brandColor1/,
    );
  });

  test('creates with --create-missing and surfaces the unique-name rule', async () => {
    const repoRoot = createTempDir('ldev-sb-');
    const portal = createStyleBookPortal([{...BRAND}]);
    const file = path.join(repoRoot, 'campus.json');
    const campus = {
      ...BRAND,
      externalReferenceCode: 'UB_CAMPUS',
      styleBookEntryKey: 'ub-campus',
      frontendTokensValues: {},
    };

    await fs.writeJson(file, campus);
    await expect(runLiferayResourceImportStyleBook(config(repoRoot), {file}, portal.dependencies)).rejects.toThrow(
      /create-missing is not enabled/,
    );
    await expect(
      runLiferayResourceImportStyleBook(config(repoRoot), {file, createMissing: true}, portal.dependencies),
    ).rejects.toThrow(/Duplicate style book entry name/);

    await fs.writeJson(file, {...campus, name: 'UB Campus'});
    expect(
      (await runLiferayResourceImportStyleBook(config(repoRoot), {file, createMissing: true}, portal.dependencies))
        .status,
    ).toBe('created');
  });
});
