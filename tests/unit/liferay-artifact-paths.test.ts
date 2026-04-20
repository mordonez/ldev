import fs from 'fs-extra';
import path from 'node:path';
import {describe, expect, test} from 'vitest';

import {
  resolveArtifactFile,
  resolveArtifactBaseDir,
  resolveArtifactSiteDir,
  resolveFragmentProjectDir,
  sanitizeArtifactToken,
  resolveSiteToken,
  siteTokenToFriendlyUrl,
  tryResolveArtifactBaseDir,
  tryResolveArtifactSiteDir,
  tryResolveFragmentsBaseDir,
  type ArtifactType,
} from '../../src/features/liferay/resource/artifact-paths.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

// ---------------------------------------------------------------------------
// Minimal config fixture (no filesystem access needed for path tests)
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve('/repo');

function makeConfig(paths?: {templates?: string; structures?: string; adts?: string; fragments?: string}) {
  return {
    repoRoot: REPO_ROOT,
    cwd: REPO_ROOT,
    paths: paths ?? {
      templates: 'liferay/resources/journal/templates',
      structures: 'liferay/resources/journal/structures',
      adts: 'liferay/resources/templates/application_display',
      fragments: 'liferay/fragments',
    },
  } as Parameters<typeof resolveArtifactBaseDir>[0];
}

// ---------------------------------------------------------------------------
// sanitizeArtifactToken
// ---------------------------------------------------------------------------

describe('sanitizeArtifactToken', () => {
  test('alphanumeric passes through unchanged', () => {
    expect(sanitizeArtifactToken('myTemplate')).toBe('myTemplate');
  });

  test('spaces replaced by underscore', () => {
    expect(sanitizeArtifactToken('my template')).toBe('my_template');
  });

  test('multiple consecutive spaces collapse to one underscore', () => {
    expect(sanitizeArtifactToken('a  b__c')).toBe('a_b_c');
  });

  test('dashes are preserved (allowed in charset)', () => {
    expect(sanitizeArtifactToken('a--b')).toBe('a--b');
  });

  test('dots and dashes are preserved', () => {
    expect(sanitizeArtifactToken('my-template.v2')).toBe('my-template.v2');
  });

  test('empty string returns unnamed', () => {
    expect(sanitizeArtifactToken('')).toBe('unnamed');
  });

  test('only specials (non-empty after trim) returns underscore', () => {
    expect(sanitizeArtifactToken('  !!  ')).toBe('_');
  });

  test('only whitespace (empty after trim) returns unnamed', () => {
    expect(sanitizeArtifactToken('   ')).toBe('unnamed');
  });

  test('leading/trailing spaces are trimmed before processing', () => {
    expect(sanitizeArtifactToken('  hello world  ')).toBe('hello_world');
  });

  test('unicode chars are replaced', () => {
    expect(sanitizeArtifactToken('café')).toBe('caf_');
  });
});

// ---------------------------------------------------------------------------
// resolveSiteToken – site friendly URL → directory token
// ---------------------------------------------------------------------------

describe('resolveSiteToken', () => {
  test('strips leading slash', () => {
    expect(resolveSiteToken('/my-site')).toBe('my-site');
  });

  test('empty string returns global', () => {
    expect(resolveSiteToken('')).toBe('global');
  });

  test('whitespace-only returns global', () => {
    expect(resolveSiteToken('   ')).toBe('global');
  });

  test('/global returns global', () => {
    expect(resolveSiteToken('/global')).toBe('global');
  });

  test('already-clean token passes through', () => {
    expect(resolveSiteToken('my-site')).toBe('my-site');
  });

  test('nested path keeps structure', () => {
    expect(resolveSiteToken('/parent/child')).toBe('parent/child');
  });
});

// ---------------------------------------------------------------------------
// siteTokenToFriendlyUrl – directory token → site friendly URL (inverse)
// ---------------------------------------------------------------------------

describe('siteTokenToFriendlyUrl', () => {
  test('global token → /global', () => {
    expect(siteTokenToFriendlyUrl('global')).toBe('/global');
  });

  test('regular token → /token', () => {
    expect(siteTokenToFriendlyUrl('my-site')).toBe('/my-site');
  });

  test('roundtrip resolveSiteToken → siteTokenToFriendlyUrl', () => {
    for (const url of ['/global', '/my-site', '/group/subsite']) {
      expect(siteTokenToFriendlyUrl(resolveSiteToken(url))).toBe(url);
    }
  });

  test('roundtrip siteTokenToFriendlyUrl → resolveSiteToken', () => {
    for (const token of ['global', 'my-site', 'group/subsite']) {
      expect(resolveSiteToken(siteTokenToFriendlyUrl(token))).toBe(token);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveArtifactBaseDir – default paths (no dirOverride)
// ---------------------------------------------------------------------------

describe('resolveArtifactBaseDir – defaults', () => {
  const cfg = makeConfig();

  test('template → configured templates base dir', () => {
    expect(resolveArtifactBaseDir(cfg, 'template')).toBe(path.join(REPO_ROOT, 'liferay/resources/journal/templates'));
  });

  test('structure → configured structures base dir', () => {
    expect(resolveArtifactBaseDir(cfg, 'structure')).toBe(path.join(REPO_ROOT, 'liferay/resources/journal/structures'));
  });

  test('adt → configured adts base dir', () => {
    expect(resolveArtifactBaseDir(cfg, 'adt')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/templates/application_display'),
    );
  });

  test('fragment → configured fragments base dir (without sites/)', () => {
    expect(resolveArtifactBaseDir(cfg, 'fragment')).toBe(path.join(REPO_ROOT, 'liferay/fragments'));
  });
});

// ---------------------------------------------------------------------------
// resolveArtifactBaseDir – dirOverride
// ---------------------------------------------------------------------------

describe('resolveArtifactBaseDir – dirOverride', () => {
  const cfg = makeConfig();

  test.each(['template', 'structure', 'adt', 'fragment'] as ArtifactType[])(
    '%s: absolute dirOverride is used as-is',
    (type) => {
      const override = path.resolve('/custom/dir');
      expect(resolveArtifactBaseDir(cfg, type, override)).toBe(override);
    },
  );

  test.each(['template', 'structure', 'adt', 'fragment'] as ArtifactType[])(
    '%s: relative dirOverride is resolved against repoRoot',
    (type) => {
      expect(resolveArtifactBaseDir(cfg, type, 'custom/out')).toBe(path.join(REPO_ROOT, 'custom/out'));
    },
  );

  test.each(['template', 'structure', 'adt', 'fragment'] as ArtifactType[])(
    '%s: blank/whitespace dirOverride falls back to default',
    (type) => {
      const defaultDir = resolveArtifactBaseDir(cfg, type);
      expect(resolveArtifactBaseDir(cfg, type, '   ')).toBe(defaultDir);
      expect(resolveArtifactBaseDir(cfg, type, undefined)).toBe(defaultDir);
    },
  );
});

// ---------------------------------------------------------------------------
// resolveArtifactSiteDir – templates / structures / adts (baseDir + siteToken)
// ---------------------------------------------------------------------------

describe('resolveArtifactSiteDir – non-fragment types', () => {
  const cfg = makeConfig();

  test('template: appends siteToken to templates base dir', () => {
    expect(resolveArtifactSiteDir(cfg, 'template', 'my-site')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/journal/templates', 'my-site'),
    );
  });

  test('structure: appends siteToken to structures base dir', () => {
    expect(resolveArtifactSiteDir(cfg, 'structure', 'global')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/journal/structures', 'global'),
    );
  });

  test('adt: appends siteToken to adts base dir', () => {
    expect(resolveArtifactSiteDir(cfg, 'adt', 'custom-site')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/templates/application_display', 'custom-site'),
    );
  });

  test('template with dirOverride: appends siteToken to override dir', () => {
    expect(resolveArtifactSiteDir(cfg, 'template', 'global', 'custom/templates')).toBe(
      path.join(REPO_ROOT, 'custom/templates', 'global'),
    );
  });

  test('structure with absolute dirOverride: appends siteToken to override', () => {
    const override = path.resolve('/abs/structures');
    expect(resolveArtifactSiteDir(cfg, 'structure', 'global', override)).toBe(path.join(override, 'global'));
  });
});

// ---------------------------------------------------------------------------
// resolveArtifactSiteDir – fragment (historical 'sites/' prefix)
// ---------------------------------------------------------------------------

describe('resolveArtifactSiteDir – fragment (compat sites/ prefix)', () => {
  const cfg = makeConfig();

  test('no dirOverride: uses fragmentsBaseDir/sites/siteToken', () => {
    expect(resolveArtifactSiteDir(cfg, 'fragment', 'my-site')).toBe(
      path.join(REPO_ROOT, 'liferay/fragments', 'sites', 'my-site'),
    );
  });

  test('global site: uses sites/global subdir', () => {
    expect(resolveArtifactSiteDir(cfg, 'fragment', 'global')).toBe(
      path.join(REPO_ROOT, 'liferay/fragments', 'sites', 'global'),
    );
  });

  test('with dirOverride: returns dirOverride directly (legacy --dir behavior, no sites/ prefix)', () => {
    // When --dir is provided for fragments, it IS the project root for that site
    expect(resolveArtifactSiteDir(cfg, 'fragment', 'my-site', 'my/fragments/project')).toBe(
      path.join(REPO_ROOT, 'my/fragments/project'),
    );
  });

  test('with absolute dirOverride: returns it directly', () => {
    const override = path.resolve('/abs/fragments/project');
    expect(resolveArtifactSiteDir(cfg, 'fragment', 'my-site', override)).toBe(override);
  });
});

// ---------------------------------------------------------------------------
// resolveArtifactBaseDir / resolveArtifactSiteDir – fallback default paths
// (when config.paths is not set)
// ---------------------------------------------------------------------------

describe('resolveArtifactBaseDir – fallback default paths', () => {
  const cfgNoPathsKey = {
    repoRoot: REPO_ROOT,
    cwd: REPO_ROOT,
    paths: undefined,
  } as Parameters<typeof resolveArtifactBaseDir>[0];

  test('template falls back to liferay/resources/journal/templates', () => {
    expect(resolveArtifactBaseDir(cfgNoPathsKey, 'template')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/journal/templates'),
    );
  });

  test('structure falls back to liferay/resources/journal/structures', () => {
    expect(resolveArtifactBaseDir(cfgNoPathsKey, 'structure')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/journal/structures'),
    );
  });

  test('adt falls back to liferay/resources/templates/application_display', () => {
    expect(resolveArtifactBaseDir(cfgNoPathsKey, 'adt')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/templates/application_display'),
    );
  });

  test('fragment falls back to liferay/fragments', () => {
    expect(resolveArtifactBaseDir(cfgNoPathsKey, 'fragment')).toBe(path.join(REPO_ROOT, 'liferay/fragments'));
  });
});

describe('tryResolveArtifact* helpers', () => {
  const cfg = makeConfig();
  const cfgWithoutRepoRoot = {
    ...makeConfig(),
    repoRoot: null,
  } as Parameters<typeof tryResolveArtifactBaseDir>[0];

  test('tryResolveFragmentsBaseDir returns configured path when repoRoot exists', () => {
    expect(tryResolveFragmentsBaseDir(cfg)).toBe(path.join(REPO_ROOT, 'liferay/fragments'));
  });

  test('tryResolveArtifactBaseDir returns configured path when repoRoot exists', () => {
    expect(tryResolveArtifactBaseDir(cfg, 'structure')).toBe(
      path.join(REPO_ROOT, 'liferay/resources/journal/structures'),
    );
  });

  test('tryResolveArtifactSiteDir returns configured fragment site path when repoRoot exists', () => {
    expect(tryResolveArtifactSiteDir(cfg, 'fragment', 'guest')).toBe(
      path.join(REPO_ROOT, 'liferay/fragments', 'sites', 'guest'),
    );
  });

  test('tryResolveFragmentsBaseDir returns undefined without repoRoot', () => {
    expect(tryResolveFragmentsBaseDir(cfgWithoutRepoRoot)).toBeUndefined();
  });

  test('tryResolveArtifactBaseDir returns undefined without repoRoot', () => {
    expect(tryResolveArtifactBaseDir(cfgWithoutRepoRoot, 'template')).toBeUndefined();
  });

  test('tryResolveArtifactSiteDir returns undefined without repoRoot', () => {
    expect(tryResolveArtifactSiteDir(cfgWithoutRepoRoot, 'structure', 'guest')).toBeUndefined();
  });

  test('tryResolveArtifactSiteDir keeps strict repo semantics for dirOverride and returns undefined without repoRoot', () => {
    expect(tryResolveArtifactSiteDir(cfgWithoutRepoRoot, 'template', 'guest', 'custom/templates')).toBeUndefined();
  });
});

describe('resolveArtifactFile', () => {
  test('template uses fileOverride relative to repo root', async () => {
    const repoRoot = createTempDir('artifact-paths-template-file-');
    const filePath = path.join(repoRoot, 'custom', 'NEWS.ftl');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '<#-- news -->');

    const config = makeConfig({
      templates: 'liferay/resources/journal/templates',
      structures: 'liferay/resources/journal/structures',
      adts: 'liferay/resources/templates/application_display',
      fragments: 'liferay/fragments',
    });
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    await expect(
      resolveArtifactFile(config, {
        type: 'template',
        key: 'NEWS',
        siteToken: 'global',
        fileOverride: 'custom/NEWS.ftl',
      }),
    ).resolves.toBe(filePath);
  });

  test('template falls back from siteToken to global path', async () => {
    const repoRoot = createTempDir('artifact-paths-template-global-fallback-');
    const filePath = path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'global', 'NEWS.ftl');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '<#-- news -->');

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    await expect(resolveArtifactFile(config, {type: 'template', key: 'NEWS', siteToken: 'guest'})).resolves.toBe(
      filePath,
    );
  });

  test('structure keeps historical name-based lookup across site folders', async () => {
    const repoRoot = createTempDir('artifact-paths-structure-lookup-');
    const filePath = path.join(repoRoot, 'liferay', 'resources', 'journal', 'structures', 'guest', 'BASIC.json');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, {dataDefinitionKey: 'BASIC'});

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    await expect(resolveArtifactFile(config, {type: 'structure', key: 'BASIC'})).resolves.toBe(filePath);
  });

  test('adt keeps historical widget-dir suffix lookup', async () => {
    const repoRoot = createTempDir('artifact-paths-adt-lookup-');
    const filePath = path.join(
      repoRoot,
      'liferay',
      'resources',
      'templates',
      'application_display',
      'global',
      'search_result_summary',
      'RESULTS.ftl',
    );
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '<#-- adt -->');

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    await expect(
      resolveArtifactFile(config, {type: 'adt', key: 'RESULTS', widgetType: 'search-result-summary'}),
    ).resolves.toBe(filePath);
  });
});

describe('resolveFragmentProjectDir', () => {
  test('without dirOverride uses historical fragments/sites/siteToken path', () => {
    const cfg = makeConfig();
    expect(resolveFragmentProjectDir(cfg, 'global')).toBe(path.join(REPO_ROOT, 'liferay/fragments', 'sites', 'global'));
  });

  test('dirOverride pointing to project root is returned as-is', async () => {
    const repoRoot = createTempDir('artifact-paths-fragments-root-');
    const projectDir = path.join(repoRoot, 'custom-fragments');
    await fs.ensureDir(path.join(projectDir, 'src'));

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    expect(resolveFragmentProjectDir(config, 'global', 'custom-fragments')).toBe(projectDir);
  });

  test('dirOverride pointing to nested fragment dir resolves back to project root', async () => {
    const repoRoot = createTempDir('artifact-paths-fragments-nested-');
    const projectDir = path.join(repoRoot, 'custom-fragments');
    const nestedDir = path.join(projectDir, 'src', 'base', 'fragments', 'hero-banner');
    await fs.ensureDir(nestedDir);

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    expect(resolveFragmentProjectDir(config, 'global', 'custom-fragments/src/base/fragments/hero-banner')).toBe(
      projectDir,
    );
  });

  test('dirOverride without src falls back to dir/siteToken for all-sites compatibility', async () => {
    const repoRoot = createTempDir('artifact-paths-fragments-site-subdir-');
    const siteDir = path.join(repoRoot, 'custom-fragments', 'guest');
    await fs.ensureDir(siteDir);

    const config = makeConfig();
    config.repoRoot = repoRoot;
    config.cwd = repoRoot;

    expect(resolveFragmentProjectDir(config, 'guest', 'custom-fragments')).toBe(siteDir);
  });
});
