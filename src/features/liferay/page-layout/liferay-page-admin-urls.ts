export function buildLayoutConfigureUrl(
  baseUrl: string,
  siteFriendlyUrl: string,
  groupId: number,
  plid: number,
  screenNavigationEntryKey = 'general',
  privateLayout = false,
): string {
  const siteSlug = encodeURIComponent(siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl);
  const encodedScreenNavigationEntryKey = encodeURIComponent(screenNavigationEntryKey);
  const prefix = '&_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_';
  return (
    `${baseUrl}/group/${siteSlug}/~/control_panel/manage?p_p_id=com_liferay_layout_admin_web_portlet_GroupPagesPortlet` +
    '&p_p_lifecycle=0&p_p_state=maximized' +
    `${prefix}mvcRenderCommandName=%2Flayout_admin%2Fedit_layout` +
    `${prefix}selPlid=${plid}` +
    `${prefix}groupId=${groupId}` +
    `${prefix}privateLayout=${privateLayout}` +
    `${prefix}screenNavigationEntryKey=${encodedScreenNavigationEntryKey}`
  );
}

export function buildLayoutTranslateUrl(
  baseUrl: string,
  siteFriendlyUrl: string,
  plid: number,
  classNameId: number,
): string {
  const siteSlug = encodeURIComponent(siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl);
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
): {edit: string; configure: string; translate: string} {
  const separator = pageUrl.includes('?') ? '&' : '?';
  return {
    edit: `${baseUrl}${pageUrl}${separator}p_l_mode=edit`,
    configure: buildLayoutConfigureUrl(baseUrl, siteFriendlyUrl, groupId, plid, 'general', privateLayout),
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
  const siteSlug = encodeURIComponent(siteFriendlyUrl.startsWith('/') ? siteFriendlyUrl.slice(1) : siteFriendlyUrl);
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
