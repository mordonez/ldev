import {describe, expect, test} from 'vitest';

import {
  buildJournalArticleAdminUrls,
  buildLayoutAdminUrls,
  buildLayoutConfigureUrl,
  buildLayoutTranslateUrl,
} from '../../src/features/liferay/page-layout/liferay-page-admin-urls.js';

describe('liferay page admin urls', () => {
  test('uses privateLayout=false by default', () => {
    const url = buildLayoutConfigureUrl('http://localhost:8080', '/guest', 20121, 1011, 'general');

    expect(url).toContain('p_r_p_selPlid=1011');
    expect(url).toContain('_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false');
  });

  test('supports privateLayout=true when requested', () => {
    const url = buildLayoutConfigureUrl('http://localhost:8080', '/guest', 20121, 1011, 'general', true);

    expect(url).toContain('_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=true');
  });

  test('encodes site slug and screen navigation key to avoid query injection', () => {
    const url = buildLayoutConfigureUrl('http://localhost:8080', '/guest site&team', 20121, 1011, 'gen&eral=1');

    expect(url).toContain('/group/guest%20site%26team/~/control_panel/manage');
    expect(url).toContain('screenNavigationEntryKey=gen%26eral%3D1');
    expect(url).not.toContain('screenNavigationEntryKey=gen&eral=1');
  });

  test('buildLayoutAdminUrls appends edit mode with correct separator when page already has query params', () => {
    const urls = buildLayoutAdminUrls('http://localhost:8080', '/guest', 20121, 1011, '/my-page?foo=bar', 20001);

    expect(urls.view).toBe('http://localhost:8080/my-page?foo=bar');
    expect(urls.edit).toBe('http://localhost:8080/my-page?foo=bar&p_l_mode=edit');
    expect(urls.configureGeneral).toContain('screenNavigationEntryKey=general');
    expect(urls.configureDesign).toContain('screenNavigationEntryKey=design');
    expect(urls.configureSeo).toContain('screenNavigationEntryKey=seo');
    expect(urls.configureOpenGraph).toContain('screenNavigationEntryKey=open-graph');
    expect(urls.configureCustomMetaTags).toContain('screenNavigationEntryKey=custom-meta-tags');
  });

  test('buildLayoutTranslateUrl encodes site slug', () => {
    const url = buildLayoutTranslateUrl('http://localhost:8080', '/guest site', 1011, 20001);

    expect(url).toContain('/group/guest%20site/~/control_panel/manage');
  });

  test('buildJournalArticleAdminUrls encodes articleId and site slug', () => {
    const urls = buildJournalArticleAdminUrls('http://localhost:8080', '/guest site', 20121, 'My Article/1', 777, 333);

    expect(urls.edit).toContain('/group/guest%20site/~/control_panel/manage');
    expect(urls.edit).toContain('articleId=My%20Article%2F1');
  });
});
