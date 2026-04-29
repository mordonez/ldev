import {describe, expect, test} from 'vitest';

import type {LiferayInventoryPageResult} from '../../src/features/liferay/inventory/liferay-inventory-page.js';
import {
  formatLiferayInventoryWhereUsed,
  matchPageAgainstResource,
  validateWhereUsedQuery,
  type WhereUsedResult,
} from '../../src/features/liferay/inventory/liferay-inventory-where-used.js';

const REGULAR_PAGE_BASE: Extract<LiferayInventoryPageResult, {pageType: 'regularPage'}> = {
  pageType: 'regularPage',
  pageSubtype: 'content',
  pageUiType: 'Content Page',
  siteName: 'Guest',
  siteFriendlyUrl: '/guest',
  groupId: 20121,
  url: '/web/guest/home',
  friendlyUrl: '/home',
  pageName: 'Home',
  privateLayout: false,
  layout: {layoutId: 11, plid: 1011, friendlyUrl: '/home', type: 'content', hidden: false},
  layoutDetails: {},
  adminUrls: {
    view: '',
    edit: '',
    configureGeneral: '',
    configureDesign: '',
    configureSeo: '',
    configureOpenGraph: '',
    configureCustomMetaTags: '',
    translate: '',
  },
};

describe('validateWhereUsedQuery', () => {
  test('rejects unknown resource type', () => {
    expect(() => validateWhereUsedQuery({type: 'unknown' as never, keys: ['x']})).toThrow(/--type/);
  });

  test('rejects empty keys', () => {
    expect(() => validateWhereUsedQuery({type: 'fragment', keys: []})).toThrow(/--key/);
    expect(() => validateWhereUsedQuery({type: 'fragment', keys: ['  ']})).toThrow(/--key/);
  });

  test('deduplicates and trims keys', () => {
    expect(validateWhereUsedQuery({type: 'fragment', keys: ['  card  ', 'card', 'hero']})).toEqual({
      type: 'fragment',
      keys: ['card', 'hero'],
    });
  });
});

describe('matchPageAgainstResource - fragments', () => {
  test('matches fragment by fragmentKey on regular page', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {type: 'fragment', fragmentKey: 'banner', elementName: 'main-banner'},
        {type: 'fragment', fragmentKey: 'card-hero'},
        {type: 'widget', widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet'},
      ],
    };

    const matches = matchPageAgainstResource(page, {type: 'fragment', keys: ['card-hero']});
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      resourceType: 'fragment',
      matchedKey: 'card-hero',
      matchKind: 'fragmentEntry',
    });
    expect(matches[0].detail).toContain('index=1');
  });

  test('returns empty when fragment is not present', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [{type: 'fragment', fragmentKey: 'banner'}],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['missing']})).toHaveLength(0);
  });

  test('OR-matches across multiple keys in a single pass', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {type: 'fragment', fragmentKey: 'banner'},
        {type: 'fragment', fragmentKey: 'card-hero'},
      ],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['banner', 'card-hero']})).toHaveLength(2);
  });
});

describe('matchPageAgainstResource - widgets and portlets', () => {
  test('matches widget by widgetName or portletId in fragmentEntryLinks', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      fragmentEntryLinks: [
        {
          type: 'widget',
          widgetName: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc',
        },
      ],
    };

    expect(
      matchPageAgainstResource(page, {
        type: 'widget',
        keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet'],
      }),
    ).toHaveLength(1);

    expect(
      matchPageAgainstResource(page, {
        type: 'portlet',
        keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_abc'],
      }),
    ).toHaveLength(1);
  });

  test('matches portlets table on widget pages', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      pageSubtype: 'portlet',
      pageUiType: 'Widget Page',
      portlets: [
        {
          columnId: 'column-1',
          position: 0,
          portletId: 'com_liferay_journal_content_web_portlet_JournalContentPortlet',
          portletName: 'Journal Content',
        },
      ],
    };

    const matches = matchPageAgainstResource(page, {
      type: 'widget',
      keys: ['com_liferay_journal_content_web_portlet_JournalContentPortlet'],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].matchKind).toBe('portlet');
  });
});

describe('matchPageAgainstResource - structures, templates, ADTs', () => {
  test('matches structure via journal article ddmStructureKey', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [{articleId: 'ART-1', title: 'Home', ddmStructureKey: 'BASIC', ddmTemplateKey: 'DEFAULT'}],
      contentStructures: [{contentStructureId: 301, key: 'BASIC', name: 'Basic'}],
    };

    expect(matchPageAgainstResource(page, {type: 'structure', keys: ['BASIC']})).toHaveLength(2);
  });

  test('matches template via ddmTemplateKey and widgetDefaultTemplate', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          ddmTemplateKey: 'CARD',
          widgetDefaultTemplate: 'WIDGET-CARD',
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'template', keys: ['CARD']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'template', keys: ['WIDGET-CARD']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'template', keys: ['nope']})).toHaveLength(0);
  });

  test('matches ADT via displayPageDefaultTemplate and displayPageTemplateCandidates', () => {
    const page: LiferayInventoryPageResult = {
      ...REGULAR_PAGE_BASE,
      journalArticles: [
        {
          articleId: 'ART-1',
          title: 'Home',
          ddmStructureKey: 'BASIC',
          displayPageDefaultTemplate: 'ADT-HERO',
          displayPageTemplateCandidates: ['ADT-HERO', 'ADT-OTHER'],
        },
      ],
    };

    expect(matchPageAgainstResource(page, {type: 'adt', keys: ['ADT-HERO']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'adt', keys: ['ADT-OTHER']})).toHaveLength(1);
  });

  test('matches structure on a display page via article.contentStructureId', () => {
    const page: LiferayInventoryPageResult = {
      pageType: 'displayPage',
      pageSubtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest/w/article',
      friendlyUrl: '/article',
      article: {id: 99, key: 'ART-1', title: 'Article', friendlyUrlPath: '/article', contentStructureId: 301},
      journalArticles: [{articleId: 'ART-1', title: 'Article', ddmStructureKey: 'BASIC'}],
    };

    expect(matchPageAgainstResource(page, {type: 'structure', keys: ['BASIC']})).toHaveLength(1);
    expect(matchPageAgainstResource(page, {type: 'structure', keys: ['301']})).toHaveLength(1);
  });
});

describe('matchPageAgainstResource - siteRoot pages', () => {
  test('returns empty for siteRoot pages', () => {
    const page: LiferayInventoryPageResult = {
      pageType: 'siteRoot',
      siteName: 'Guest',
      siteFriendlyUrl: '/guest',
      groupId: 20121,
      url: '/web/guest',
      pages: [],
    };
    expect(matchPageAgainstResource(page, {type: 'fragment', keys: ['banner']})).toHaveLength(0);
  });
});

describe('formatLiferayInventoryWhereUsed', () => {
  test('reports zero matches with a friendly message', () => {
    const result: WhereUsedResult = {
      inventoryType: 'whereUsed',
      query: {type: 'fragment', keys: ['banner']},
      scope: {sites: ['/guest'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 5,
        totalMatchedPages: 0,
        totalMatches: 0,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/guest',
          siteName: 'Guest',
          groupId: 20121,
          scannedPages: 5,
          failedPages: 0,
          matchedPages: [],
        },
      ],
    };

    const text = formatLiferayInventoryWhereUsed(result);
    expect(text).toContain('WHERE USED');
    expect(text).toContain('resourceType=fragment');
    expect(text).toContain('No pages matched');
  });

  test('lists matched pages with match details', () => {
    const result: WhereUsedResult = {
      inventoryType: 'whereUsed',
      query: {type: 'fragment', keys: ['banner']},
      scope: {sites: ['/guest'], includePrivate: false, concurrency: 4, maxDepth: 12},
      summary: {
        totalSites: 1,
        totalScannedPages: 1,
        totalMatchedPages: 1,
        totalMatches: 1,
        totalFailedPages: 0,
      },
      sites: [
        {
          siteFriendlyUrl: '/guest',
          siteName: 'Guest',
          groupId: 20121,
          scannedPages: 1,
          failedPages: 0,
          matchedPages: [
            {
              pageType: 'regularPage',
              pageName: 'Home',
              friendlyUrl: '/home',
              fullUrl: '/web/guest/home',
              layoutId: 11,
              plid: 1011,
              hidden: false,
              privateLayout: false,
              editUrl: 'http://localhost:8080/web/guest/home?p_l_mode=edit',
              matches: [
                {
                  resourceType: 'fragment',
                  matchedKey: 'banner',
                  matchKind: 'fragmentEntry',
                  detail: 'fragmentKey=banner index=0',
                },
              ],
            },
          ],
        },
      ],
    };

    const text = formatLiferayInventoryWhereUsed(result);
    expect(text).toContain('site=/guest');
    expect(text).toContain('Home');
    expect(text).toContain('fragmentEntry: fragmentKey=banner');
    expect(text).toContain('editUrl=http://localhost:8080/web/guest/home');
  });
});
