import {trimLeadingSlash} from '../../../core/utils/text.js';

export function buildLayoutConfigureUrl(
  baseUrl: string,
  siteFriendlyUrl: string,
  groupId: number,
  plid: number,
  screenNavigationEntryKey = 'general',
  privateLayout = false,
): string {
  const siteSlug = encodeURIComponent(trimLeadingSlash(siteFriendlyUrl));
  const encodedScreenNavigationEntryKey = encodeURIComponent(screenNavigationEntryKey);
  const prefix = '&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_';
  return (
    `${baseUrl}/group/${siteSlug}/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet` +
    '&p_p_lifecycle=0&p_p_state=maximized' +
    `&p_r_p_selPlid=${plid}` +
    `${prefix}mvcRenderCommandName=%2Flayout_admin%2Fedit_layout` +
    `${prefix}groupId=${groupId}` +
    `${prefix}privateLayout=${privateLayout}` +
    `${prefix}screenNavigationCategoryKey=general` +
    `${prefix}screenNavigationEntryKey=${encodedScreenNavigationEntryKey}`
  );
}

export function buildLayoutTranslateUrl(
  baseUrl: string,
  siteFriendlyUrl: string,
  plid: number,
  classNameId: number,
): string {
  const siteSlug = encodeURIComponent(trimLeadingSlash(siteFriendlyUrl));
  const prefix = '&_com_liferay_translation_web_internal_portlet_TranslationPortlet_';
  return (
    `${baseUrl}/group/${siteSlug}/~/control_panel/manage?p_p_id=com_liferay_translation_web_internal_portlet_TranslationPortlet` +
    '&p_p_lifecycle=0&p_p_state=maximized' +
    `${prefix}mvcRenderCommandName=%2Ftranslation%2Ftranslate` +
    `${prefix}classNameId=${classNameId}` +
    `${prefix}classPK=${plid}` +
    `${prefix}portletResource=com_liferay_layout_admin_web_portlet_GroupPagesPortlet`
  );
}

export function buildLayoutAdminUrls(
  baseUrl: string,
  siteFriendlyUrl: string,
  groupId: number,
  plid: number,
  pageUrl: string,
  layoutClassNameId: number,
  privateLayout = false,
): {
  view: string;
  edit: string;
  configureGeneral: string;
  configureDesign: string;
  configureSeo: string;
  configureOpenGraph: string;
  configureCustomMetaTags: string;
  translate: string;
} {
  const separator = pageUrl.includes('?') ? '&' : '?';
  const configureGeneral = buildLayoutConfigureUrl(baseUrl, siteFriendlyUrl, groupId, plid, 'general', privateLayout);
  return {
    view: `${baseUrl}${pageUrl}`,
    edit: `${baseUrl}${pageUrl}${separator}p_l_mode=edit`,
    configureGeneral,
    configureDesign: buildLayoutConfigureUrl(baseUrl, siteFriendlyUrl, groupId, plid, 'design', privateLayout),
    configureSeo: buildLayoutConfigureUrl(baseUrl, siteFriendlyUrl, groupId, plid, 'seo', privateLayout),
    configureOpenGraph: buildLayoutConfigureUrl(baseUrl, siteFriendlyUrl, groupId, plid, 'open-graph', privateLayout),
    configureCustomMetaTags: buildLayoutConfigureUrl(
      baseUrl,
      siteFriendlyUrl,
      groupId,
      plid,
      'custom-meta-tags',
      privateLayout,
    ),
    translate: buildLayoutTranslateUrl(baseUrl, siteFriendlyUrl, plid, layoutClassNameId),
  };
}

export function buildJournalArticleAdminUrls(
  baseUrl: string,
  siteFriendlyUrl: string,
  groupId: number,
  articleId: string,
  classPK: number,
  articleClassNameId: number,
): {edit: string; translate: string} {
  const siteSlug = encodeURIComponent(trimLeadingSlash(siteFriendlyUrl));
  const manageBase = `${baseUrl}/group/${siteSlug}/~/control_panel/manage`;
  const journalPrefix = '&_com_liferay_journal_web_portlet_JournalPortlet_';
  const translationPrefix = '&_com_liferay_translation_web_internal_portlet_TranslationPortlet_';
  const encodedArticleId = encodeURIComponent(articleId);

  return {
    edit:
      `${manageBase}?p_p_id=com_liferay_journal_web_portlet_JournalPortlet` +
      '&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view' +
      `${journalPrefix}mvcRenderCommandName=/journal/edit_article` +
      `${journalPrefix}articleId=${encodedArticleId}` +
      `${journalPrefix}groupId=${groupId}`,
    translate:
      `${manageBase}?p_p_id=com_liferay_translation_web_internal_portlet_TranslationPortlet` +
      '&p_p_lifecycle=0&p_p_state=maximized' +
      `${translationPrefix}mvcRenderCommandName=%2Ftranslation%2Ftranslate` +
      `${translationPrefix}classNameId=${articleClassNameId}` +
      `${translationPrefix}classPK=${classPK}` +
      `${translationPrefix}portletResource=com_liferay_journal_web_portlet_JournalPortlet`,
  };
}
