import type {LiferayInventoryPageResult} from './liferay-inventory-page.js';
import type {LiferayInventoryPagesNode} from './liferay-inventory-pages.js';
import type {WhereUsedMatch} from './liferay-inventory-where-used-match.js';

export type FlatPage = {
  fullUrl: string;
  friendlyUrl: string;
  name: string;
  layoutId: number;
  plid: number;
  hidden: boolean;
  privateLayout: boolean;
};

export type WhereUsedPageMatch = {
  pageType: 'regularPage' | 'displayPage';
  pageName: string;
  friendlyUrl: string;
  fullUrl: string;
  layoutId?: number;
  plid?: number;
  privateLayout: boolean;
  hidden?: boolean;
  editUrl?: string;
  matches: WhereUsedMatch[];
};

export function flattenPages(pages: LiferayInventoryPagesNode[], privateLayout: boolean): FlatPage[] {
  const result: FlatPage[] = [];
  const visit = (node: LiferayInventoryPagesNode): void => {
    result.push({
      fullUrl: node.fullUrl,
      friendlyUrl: node.friendlyUrl,
      name: node.name,
      layoutId: node.layoutId,
      plid: node.plid,
      hidden: node.hidden,
      privateLayout,
    });
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of pages) visit(node);
  return result;
}

export function buildPageMatch(
  page: LiferayInventoryPageResult,
  entry: FlatPage,
  matches: WhereUsedMatch[],
): WhereUsedPageMatch {
  if (page.pageType === 'displayPage') {
    return {
      pageType: 'displayPage',
      pageName: page.article.title,
      friendlyUrl: page.friendlyUrl,
      fullUrl: page.url,
      privateLayout: entry.privateLayout,
      ...(page.adminUrls ? {editUrl: page.adminUrls.edit} : {}),
      matches,
    };
  }

  if (page.pageType === 'regularPage') {
    return {
      pageType: 'regularPage',
      pageName: page.pageName,
      friendlyUrl: page.friendlyUrl,
      fullUrl: page.url,
      layoutId: page.layout.layoutId,
      plid: page.layout.plid,
      hidden: page.layout.hidden,
      privateLayout: page.privateLayout,
      editUrl: page.adminUrls.edit,
      matches,
    };
  }

  return {
    pageType: 'regularPage',
    pageName: entry.name,
    friendlyUrl: entry.friendlyUrl,
    fullUrl: entry.fullUrl,
    layoutId: entry.layoutId,
    plid: entry.plid,
    hidden: entry.hidden,
    privateLayout: entry.privateLayout,
    matches,
  };
}
