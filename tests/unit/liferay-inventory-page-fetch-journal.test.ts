import {beforeEach, describe, expect, test, vi} from 'vitest';

const fetchGroupInfoMock = vi.fn();
const resolveJournalArticleReferenceMock = vi.fn();

vi.mock('../../src/features/liferay/portal/site-resolution.js', () => ({
  buildSiteChain: vi.fn(),
  fetchGroupInfo: fetchGroupInfoMock,
}));

vi.mock('../../src/features/liferay/inventory/liferay-inventory-journal-article-resolver.js', () => ({
  resolveJournalArticleReference: resolveJournalArticleReferenceMock,
}));

const {collectLayoutJournalArticles} =
  await import('../../src/features/liferay/inventory/liferay-inventory-page-fetch-journal.js');

describe('collectLayoutJournalArticles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchGroupInfoMock.mockImplementation((_gateway: unknown, groupId: number) => ({
      friendlyUrl: `/site-${groupId}`,
      name: `Site ${groupId}`,
      parentGroupId: 0,
    }));
    resolveJournalArticleReferenceMock.mockImplementation((_gateway: unknown, ref: {groupId: number}) => ({
      article: {
        articleId: `ART-${ref.groupId}`,
        titleCurrentValue: `Article ${ref.groupId}`,
      },
      structuredContent: null,
      resolvedArticleId: `ART-${ref.groupId}`,
    }));
  });

  test('keeps articles from different groups when portlet preferences reuse the same article id', async () => {
    const pageElement = {
      pageElements: [
        {
          portletPreferencesMap: {
            articleId: ['SHARED-ARTICLE'],
            groupId: ['101'],
          },
        },
        {
          portletPreferencesMap: {
            articleId: ['SHARED-ARTICLE'],
            groupId: ['202'],
          },
        },
      ],
    };

    const result = await collectLayoutJournalArticles(
      {} as never,
      {liferay: {url: 'http://localhost:8080'}} as never,
      {} as never,
      999,
      pageElement as never,
    );

    expect(resolveJournalArticleReferenceMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.groupId)).toEqual([101, 202]);
    expect(result.map((item) => item.articleId)).toEqual(['ART-101', 'ART-202']);
  });
});
