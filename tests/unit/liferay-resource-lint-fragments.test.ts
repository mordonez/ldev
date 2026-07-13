import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {
  lintFragmentHtml,
  runLiferayResourceLintFragments,
} from '../../src/features/liferay/resource/liferay-resource-lint-fragments.js';
import {getLiferayResourceLintExitCode} from '../../src/features/liferay/resource/liferay-resource-lint-shared.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

async function writeFile(dir: string, relativePath: string, content: string): Promise<string> {
  const filePath = path.join(dir, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('lintFragmentHtml (pure rules)', () => {
  test('passes fully non-nested editables', () => {
    const html = `
      <div>
        <a data-lfr-editable-id="news-card-link" data-lfr-editable-type="link" href="#"></a>
        <img data-lfr-editable-id="news-card-image" data-lfr-editable-type="image" src="" />
        <span data-lfr-editable-id="news-card-title" data-lfr-editable-type="text">Title</span>
      </div>
    `;

    expect(lintFragmentHtml('index.html', html)).toHaveLength(0);
  });

  test('flags an image editable nested inside a link editable as an error', () => {
    const html = `
      <a data-lfr-editable-id="news-card-link" data-lfr-editable-type="link" href="#">
        <img data-lfr-editable-id="news-card-image" data-lfr-editable-type="image" src="" />
      </a>
    `;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'nested-editable', severity: 'error'}));
    const finding = findings.find((item) => item.rule === 'nested-editable');
    expect(finding?.message).toMatch(/image nested in a link/);
  });

  test('flags a text editable nested inside a link editable as a warning with a mapping fix', () => {
    const html = `
      <a data-lfr-editable-id="news-card-title-link" data-lfr-editable-type="link" href="#">
        <span data-lfr-editable-id="news-card-title" data-lfr-editable-type="text">Title</span>
      </a>
    `;

    const findings = lintFragmentHtml('index.html', html);
    const finding = findings.find((item) => item.rule === 'nested-editable');

    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toMatch(/fragmentLink/);
  });

  test('flags any other nested editable combination as an error', () => {
    const html = `
      <div data-lfr-editable-id="outer" data-lfr-editable-type="rich-text">
        <img data-lfr-editable-id="inner-image" data-lfr-editable-type="image" src="" />
      </div>
    `;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'nested-editable', severity: 'error'}));
  });

  test('flags an editable missing its id attribute', () => {
    const html = `<img data-lfr-editable-type="image" src="" />`;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'incomplete-editable', severity: 'error'}));
  });

  test('flags an editable missing its type attribute', () => {
    const html = `<img data-lfr-editable-id="news-card-image" src="" />`;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'incomplete-editable', severity: 'error'}));
  });

  test('flags an unknown editable type', () => {
    const html = `<div data-lfr-editable-id="news-card-video" data-lfr-editable-type="video"></div>`;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'unknown-editable-type', severity: 'error'}));
  });

  test('flags a duplicate editable id within the same fragment', () => {
    const html = `
      <span data-lfr-editable-id="news-card-title" data-lfr-editable-type="text">A</span>
      <span data-lfr-editable-id="news-card-title" data-lfr-editable-type="text">B</span>
    `;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'duplicate-editable-id', severity: 'error'}));
  });

  test('detects nesting through a FreeMarker dynamic tag name (e.g. configurable heading level)', () => {
    // Real Liferay fragments commonly use `<${configuration.headingLevel}>` for a
    // configurable h1-h6 wrapper; the tokenizer must not silently skip these tags.
    const html = `
      <\${configuration.headingLevel} data-lfr-editable-id="outer-heading" data-lfr-editable-type="link">
        <img data-lfr-editable-id="inner-image" data-lfr-editable-type="image" />
      </\${configuration.headingLevel}>
    `;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toContainEqual(expect.objectContaining({rule: 'nested-editable', severity: 'error'}));
  });

  test('does not flag a non-nested editable declared directly on a FreeMarker dynamic tag', () => {
    const html = `
      <\${configuration.headingLevel} data-lfr-editable-id="title" data-lfr-editable-type="text">
        Title
      </\${configuration.headingLevel}>
      <img data-lfr-editable-id="image" data-lfr-editable-type="image" />
    `;

    expect(lintFragmentHtml('index.html', html)).toHaveLength(0);
  });

  test('ignores editable-looking attributes inside comments and script/style blocks', () => {
    const html = `
      <!-- <img data-lfr-editable-id="commented" data-lfr-editable-type="image" /> -->
      <script>const html = '<img data-lfr-editable-id="in-script" data-lfr-editable-type="image" />';</script>
      <style>/* <img data-lfr-editable-id="in-style" data-lfr-editable-type="image" /> */</style>
      <img data-lfr-editable-id="real" data-lfr-editable-type="image" src="" />
    `;

    const findings = lintFragmentHtml('index.html', html);

    expect(findings).toHaveLength(0);
  });
});

describe('resource lint-fragments (file/dir resolution)', () => {
  test('lints a fragment discovered via fragment.json in a directory scan', async () => {
    const dir = createTempDir('dev-cli-lint-fragments-dir-');
    const fragmentDir = path.join(dir, 'src', 'marketing', 'fragments', 'news-card');
    await writeFile(
      dir,
      path.relative(dir, path.join(fragmentDir, 'fragment.json')),
      JSON.stringify({htmlPath: 'index.html'}),
    );
    await writeFile(
      dir,
      path.relative(dir, path.join(fragmentDir, 'index.html')),
      '<a data-lfr-editable-id="link" data-lfr-editable-type="link" href="#">' +
        '<img data-lfr-editable-id="image" data-lfr-editable-type="image" src="" />' +
        '</a>',
    );

    const result = await runLiferayResourceLintFragments({dir});

    expect(result.filesScanned).toBe(1);
    expect(result.ok).toBe(false);
    expect(getLiferayResourceLintExitCode(result)).toBe(1);
    expect(result.findings).toContainEqual(expect.objectContaining({rule: 'nested-editable'}));
  });

  test('lints a single --file target directly regardless of fragment.json', async () => {
    const dir = createTempDir('dev-cli-lint-fragments-file-');
    const file = await writeFile(
      dir,
      'index.html',
      '<span data-lfr-editable-id="title" data-lfr-editable-type="text">Title</span>',
    );

    const result = await runLiferayResourceLintFragments({file});

    expect(result.target).toBe(path.resolve(file));
    expect(result.ok).toBe(true);
  });

  test('throws when the directory has no fragment.json files', async () => {
    const dir = createTempDir('dev-cli-lint-fragments-empty-');

    await expect(runLiferayResourceLintFragments({dir})).rejects.toThrow(/No fragment HTML files/);
  });
});
