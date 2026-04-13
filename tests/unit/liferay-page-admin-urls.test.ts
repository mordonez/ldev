import {describe, expect, test} from 'vitest';

import {buildLayoutConfigureUrl} from '../../src/features/liferay/page-layout/liferay-page-admin-urls.js';

describe('liferay page admin urls', () => {
  test('uses privateLayout=false by default', () => {
    const url = buildLayoutConfigureUrl('http://localhost:8080', '/guest', 20121, 1011, 'general');

    expect(url).toContain('_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=false');
  });

  test('supports privateLayout=true when requested', () => {
    const url = buildLayoutConfigureUrl('http://localhost:8080', '/guest', 20121, 1011, 'general', true);

    expect(url).toContain('_com_liferay_layout_admin_web_portlet_GroupPagesPortlet_privateLayout=true');
  });
});
