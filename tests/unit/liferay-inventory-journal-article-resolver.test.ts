import {beforeEach, describe, expect, test, vi} from 'vitest';

import {resolveJournalArticleReference} from '../../src/features/liferay/inventory/liferay-inventory-journal-article-resolver.js';
import {
  fetchLatestJournalArticle,
  fetchStructuredContentById,
  fetchStructuredContentByUuid,
} from '../../src/features/liferay/inventory/liferay-inventory-page-fetch-article.js';

vi.mock('../../src/features/liferay/inventory/liferay-inventory-page-fetch-article.js', () => ({
  fetchLatestJournalArticle: vi.fn(),
  fetchStructuredContentById: vi.fn(),
  fetchStructuredContentByUuid: vi.fn(),
}));

describe('resolveJournalArticleReference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns provided article and structured content without fetching', async () => {
    const article = {articleId: 'ART-1', uuid: 'uuid-1'};
    const structuredContent = {id: 101, key: 'ART-1', contentStructureId: 301};

    const result = await resolveJournalArticleReference(
      {} as never,
      {articleId: 'ART-1', groupId: 20121},
      {article, structuredContent},
    );

    expect(result).toEqual({article, structuredContent, resolvedArticleId: 'ART-1'});
    expect(fetchStructuredContentById).not.toHaveBeenCalled();
    expect(fetchLatestJournalArticle).not.toHaveBeenCalled();
    expect(fetchStructuredContentByUuid).not.toHaveBeenCalled();
  });

  test('uses structured content key as resolved article id when ref has no articleId', async () => {
    vi.mocked(fetchStructuredContentById).mockResolvedValue({id: 101, key: 'ART-1', contentStructureId: 301} as never);
    vi.mocked(fetchLatestJournalArticle).mockResolvedValue({articleId: 'ART-1', uuid: 'uuid-1'} as never);

    const result = await resolveJournalArticleReference({} as never, {
      articleId: '',
      groupId: 20121,
      structuredContentId: 101,
    });

    expect(result.resolvedArticleId).toBe('ART-1');
    expect(fetchStructuredContentById).toHaveBeenCalledWith(expect.anything(), 101);
    expect(fetchLatestJournalArticle).toHaveBeenCalledWith(expect.anything(), 20121, 'ART-1');
  });

  test('resolves structured content by article uuid before falling back to article id', async () => {
    vi.mocked(fetchLatestJournalArticle).mockResolvedValue({articleId: 'ART-1', uuid: 'uuid-1', id: 999} as never);
    vi.mocked(fetchStructuredContentByUuid).mockResolvedValue({
      id: 101,
      key: 'ART-1',
      contentStructureId: 301,
    } as never);

    const result = await resolveJournalArticleReference({} as never, {articleId: 'ART-1', groupId: 20121});

    expect(result.structuredContent).toEqual({id: 101, key: 'ART-1', contentStructureId: 301});
    expect(fetchStructuredContentByUuid).toHaveBeenCalledWith(expect.anything(), 20121, 'uuid-1');
    expect(fetchStructuredContentById).not.toHaveBeenCalledWith(expect.anything(), 999);
  });

  test('falls back to article numeric id when uuid does not resolve structured content', async () => {
    vi.mocked(fetchLatestJournalArticle).mockResolvedValue({articleId: 'ART-1', uuid: 'uuid-1', id: 999} as never);
    vi.mocked(fetchStructuredContentByUuid).mockResolvedValue(null);
    vi.mocked(fetchStructuredContentById).mockResolvedValue({id: 999, key: 'ART-1', contentStructureId: 301} as never);

    const result = await resolveJournalArticleReference({} as never, {articleId: 'ART-1', groupId: 20121});

    expect(result.structuredContent).toEqual({id: 999, key: 'ART-1', contentStructureId: 301});
    expect(fetchStructuredContentById).toHaveBeenCalledWith(expect.anything(), 999);
  });
});
