import {describe, it, expect} from 'vitest';
import {
  buildRegularPageConfigurationTabs,
  buildConfigurationRawLayout,
  buildConfigurationRawSitePage,
  parseTypeSettingsMap,
} from '../../src/features/liferay/inventory/liferay-inventory-page-fetch-config.js';
import type {Layout} from '../../src/features/liferay/page-layout/liferay-layout-shared.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    layoutId: 1,
    plid: 1001,
    type: 'portlet',
    nameCurrentValue: 'Home',
    titleCurrentValue: 'Home Title',
    descriptionCurrentValue: 'Home Description',
    keywordsCurrentValue: 'home,portal',
    robotsCurrentValue: 'index,follow',
    robots: 'index,follow',
    friendlyURL: '/home',
    hidden: false,
    themeId: 'classic_WAR_classictheme',
    colorSchemeId: '01',
    styleBookEntryId: 0,
    masterLayoutPlid: 0,
    faviconFileEntryId: 0,
    css: '',
    javascript: '',
    typeSettings: '',
    ...overrides,
  } as Layout;
}

// ---------------------------------------------------------------------------
// parseTypeSettingsMap
// ---------------------------------------------------------------------------

describe('parseTypeSettingsMap', () => {
  it('returns empty object for empty string', () => {
    expect(parseTypeSettingsMap('')).toEqual({});
  });

  it('returns empty object for whitespace-only string', () => {
    expect(parseTypeSettingsMap('   \n  ')).toEqual({});
  });

  it('parses single key=value pair', () => {
    expect(parseTypeSettingsMap('foo=bar')).toEqual({foo: 'bar'});
  });

  it('parses multiple key=value pairs separated by newlines', () => {
    expect(parseTypeSettingsMap('a=1\nb=2\nc=3')).toEqual({a: '1', b: '2', c: '3'});
  });

  it('handles Windows-style CRLF line endings', () => {
    expect(parseTypeSettingsMap('a=1\r\nb=2')).toEqual({a: '1', b: '2'});
  });

  it('handles values containing = signs', () => {
    expect(parseTypeSettingsMap('url=http://example.com?a=1&b=2')).toEqual({
      url: 'http://example.com?a=1&b=2',
    });
  });

  it('trims whitespace from keys', () => {
    expect(parseTypeSettingsMap('  key  =value')).toEqual({key: 'value'});
  });

  it('trims whitespace from values', () => {
    expect(parseTypeSettingsMap('key=  value  ')).toEqual({key: 'value'});
  });

  it('skips lines without = separator', () => {
    expect(parseTypeSettingsMap('invalidline\nkey=value')).toEqual({key: 'value'});
  });

  it('skips lines where key is empty', () => {
    expect(parseTypeSettingsMap('=value\nkey=val')).toEqual({key: 'val'});
  });

  it('parses theme flags', () => {
    const raw = [
      'lfr-theme:regular:show-header=true',
      'lfr-theme:regular:show-footer=false',
      'layoutUpdateable=true',
    ].join('\n');
    expect(parseTypeSettingsMap(raw)).toEqual({
      'lfr-theme:regular:show-header': 'true',
      'lfr-theme:regular:show-footer': 'false',
      layoutUpdateable: 'true',
    });
  });
});

// ---------------------------------------------------------------------------
// buildConfigurationRawLayout
// ---------------------------------------------------------------------------

describe('buildConfigurationRawLayout', () => {
  it('maps all layout fields to raw layout structure', () => {
    const layout = makeLayout({
      layoutId: 42,
      plid: 5000,
      type: 'portlet',
      nameCurrentValue: 'My Page',
      titleCurrentValue: 'My Page Title',
      descriptionCurrentValue: 'Description',
      keywordsCurrentValue: 'kw1,kw2',
      robotsCurrentValue: 'noindex',
      friendlyURL: '/my-page',
      hidden: true,
      themeId: 'my-theme',
      colorSchemeId: '02',
      styleBookEntryId: 10,
      masterLayoutPlid: 20,
      faviconFileEntryId: 30,
      css: '.foo{}',
      javascript: 'console.log(1)',
    });

    const result = buildConfigurationRawLayout(layout);

    expect(result).toEqual({
      layoutId: 42,
      plid: 5000,
      type: 'portlet',
      nameCurrentValue: 'My Page',
      titleCurrentValue: 'My Page Title',
      descriptionCurrentValue: 'Description',
      keywordsCurrentValue: 'kw1,kw2',
      robotsCurrentValue: 'noindex',
      friendlyURL: '/my-page',
      hidden: true,
      themeId: 'my-theme',
      colorSchemeId: '02',
      styleBookEntryId: 10,
      masterLayoutPlid: 20,
      faviconFileEntryId: 30,
      css: '.foo{}',
      javascript: 'console.log(1)',
    });
  });

  it('coerces undefined numeric fields to 0', () => {
    const layout = makeLayout({
      layoutId: undefined as unknown as number,
      plid: undefined as unknown as number,
      styleBookEntryId: undefined as unknown as number,
      masterLayoutPlid: undefined as unknown as number,
      faviconFileEntryId: undefined as unknown as number,
    });
    const result = buildConfigurationRawLayout(layout);
    expect(result.layoutId).toBe(-1);
    expect(result.plid).toBe(-1);
    expect(result.styleBookEntryId).toBe(0);
    expect(result.masterLayoutPlid).toBe(0);
    expect(result.faviconFileEntryId).toBe(0);
  });

  it('defaults missing string fields to empty string', () => {
    const layout = makeLayout({
      nameCurrentValue: undefined as unknown as string,
      titleCurrentValue: undefined as unknown as string,
      descriptionCurrentValue: undefined as unknown as string,
      keywordsCurrentValue: undefined as unknown as string,
      robotsCurrentValue: undefined as unknown as string,
      friendlyURL: undefined as unknown as string,
      themeId: undefined as unknown as string,
      colorSchemeId: undefined as unknown as string,
      css: undefined as unknown as string,
      javascript: undefined as unknown as string,
      type: undefined as unknown as string,
    });
    const result = buildConfigurationRawLayout(layout);
    expect(result.nameCurrentValue).toBe('');
    expect(result.titleCurrentValue).toBe('');
    expect(result.type).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildConfigurationRawSitePage
// ---------------------------------------------------------------------------

describe('buildConfigurationRawSitePage', () => {
  it('returns the page metadata as-is', () => {
    const metadata = {id: '123', title: 'My Page'} as Record<string, unknown>;
    expect(buildConfigurationRawSitePage(metadata)).toBe(metadata);
  });

  it('returns an empty object unchanged', () => {
    const metadata = {};
    expect(buildConfigurationRawSitePage(metadata)).toBe(metadata);
  });
});

// ---------------------------------------------------------------------------
// buildRegularPageConfigurationTabs
// ---------------------------------------------------------------------------

describe('buildRegularPageConfigurationTabs', () => {
  it('returns correct general section for a basic layout', () => {
    const layout = makeLayout({
      type: 'portlet',
      nameCurrentValue: 'About',
      hidden: false,
      friendlyURL: '/about',
    });

    const result = buildRegularPageConfigurationTabs(layout, {}, false);

    expect(result.general.type).toBe('portlet');
    expect(result.general.name).toBe('About');
    expect(result.general.hiddenInNavigation).toBe(false);
    expect(result.general.friendlyUrl).toBe('/about');
    expect(result.general.privateLayout).toBe(false);
  });

  it('marks page as private when privateLayout=true', () => {
    const layout = makeLayout();
    const result = buildRegularPageConfigurationTabs(layout, {}, true);
    expect(result.general.privateLayout).toBe(true);
  });

  it('includes targetUrl in target field when provided in layoutDetails', () => {
    const layout = makeLayout();
    const result = buildRegularPageConfigurationTabs(layout, {targetUrl: 'https://example.com'}, false);
    expect(result.general.target).toBe('https://example.com');
    expect(result.general.targetType).toBe('url');
  });

  it('leaves target empty when no targetUrl', () => {
    const layout = makeLayout();
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.general.target).toBe('');
    expect(result.general.targetType).toBe('');
  });

  it('parses typeSettings from layout for theme flags', () => {
    const layout = makeLayout({
      typeSettings: 'lfr-theme:regular:show-header=true\nlfr-theme:regular:show-footer=false',
    });
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.design.themeFlags.showHeader).toBe(true);
    expect(result.design.themeFlags.showFooter).toBe(false);
  });

  it('includes SEO fields from layout', () => {
    const layout = makeLayout({
      titleCurrentValue: 'SEO Title',
      descriptionCurrentValue: 'SEO Description',
      keywordsCurrentValue: 'kw1,kw2',
      robotsCurrentValue: 'noindex,nofollow',
    });
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.seo.title).toBe('SEO Title');
    expect(result.seo.description).toBe('SEO Description');
    expect(result.seo.keywords).toBe('kw1,kw2');
    expect(result.seo.robots).toBe('noindex,nofollow');
  });

  it('extracts sitemap settings from typeSettings', () => {
    const layout = makeLayout({
      typeSettings: 'sitemap-include=true\nsitemap-changefreq=daily',
    });
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.seo.sitemap.include).toBe(true);
    expect(result.seo.sitemap.changefreq).toBe('daily');
  });

  it('extracts openGraph from page metadata settings', () => {
    const layout = makeLayout();
    const metadata = {
      openGraphTitle: 'OG Title',
      openGraphDescription: 'OG Description',
      settings: {
        openGraphTitle: 'Settings OG Title',
      },
    };
    const result = buildRegularPageConfigurationTabs(layout, {}, false, metadata);
    // settings values take priority
    expect(result.openGraph.title).toBe('Settings OG Title');
    expect(result.openGraph.description).toBe('OG Description');
  });

  it('extracts categories and tags from page metadata', () => {
    const layout = makeLayout();
    const metadata = {
      taxonomyCategoryBriefs: [{taxonomyCategoryName: 'Technology'}, {taxonomyCategoryName: 'News'}],
      keywords: ['tag1', 'tag2'],
    };
    const result = buildRegularPageConfigurationTabs(layout, {}, false, metadata);
    expect(result.general.categories).toEqual(['Technology', 'News']);
    expect(result.general.tags).toEqual(['tag1', 'tag2']);
  });

  it('filters empty category names', () => {
    const layout = makeLayout();
    const metadata = {
      taxonomyCategoryBriefs: [
        {taxonomyCategoryName: ''},
        {taxonomyCategoryName: '  '},
        {taxonomyCategoryName: 'Tech'},
      ],
    };
    const result = buildRegularPageConfigurationTabs(layout, {}, false, metadata);
    expect(result.general.categories).toEqual(['Tech']);
  });

  it('extracts custom fields from metadata', () => {
    const layout = makeLayout();
    const metadata = {
      customFields: [
        {name: 'myField', customValue: {data: 'custom-value'}},
        {name: '', customValue: {data: 'ignored'}},
      ],
    };
    const result = buildRegularPageConfigurationTabs(layout, {}, false, metadata);
    expect(result.design.customFields).toEqual({myField: 'custom-value'});
  });

  it('uses layout design fields', () => {
    const layout = makeLayout({
      themeId: 'my-theme',
      colorSchemeId: '02',
      styleBookEntryId: 5,
      masterLayoutPlid: 10,
      faviconFileEntryId: 20,
      css: '.custom{}',
      javascript: 'alert(1)',
    });
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.design.theme.themeId).toBe('my-theme');
    expect(result.design.theme.colorSchemeId).toBe('02');
    expect(result.design.theme.styleBookEntryId).toBe(5);
    expect(result.design.customCss).toBe('.custom{}');
    expect(result.design.customJavascript).toBe('alert(1)');
  });

  it('returns empty categories and tags when metadata is absent', () => {
    const layout = makeLayout();
    const result = buildRegularPageConfigurationTabs(layout, {}, false);
    expect(result.general.categories).toEqual([]);
    expect(result.general.tags).toEqual([]);
  });

  it('handles null metadata gracefully', () => {
    const layout = makeLayout();
    const result = buildRegularPageConfigurationTabs(layout, {}, false, null);
    expect(result.general.categories).toEqual([]);
    expect(result.general.tags).toEqual([]);
    expect(result.design.customFields).toEqual({});
  });
});
