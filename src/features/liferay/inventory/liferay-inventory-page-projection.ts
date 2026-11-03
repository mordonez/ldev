import {
  validateLiferayInventoryPageJsonResult,
  type LiferayInventoryPageJsonResult,
} from './liferay-inventory-page-json-schema.js';
import type {LiferayInventoryPageResult} from './liferay-inventory-page.js';
import {projectDisplayPageJson, projectJournalArticleRef} from './liferay-inventory-page-projection-display.js';

export function projectLiferayInventoryPageJson(
  result: LiferayInventoryPageResult,
  options?: {full?: boolean},
): LiferayInventoryPageJsonResult {
  if (result.pageType === 'displayPage') {
    return validateLiferayInventoryPageJsonResult(projectDisplayPageJson(result, options));
  }

  if (result.pageType === 'siteRoot') {
    return validateLiferayInventoryPageJsonResult({
      page: {
        type: 'siteRoot',
        ...(result.siteName ? {siteName: result.siteName} : {}),
        siteFriendlyUrl: result.siteFriendlyUrl,
        groupId: result.groupId,
        url: result.url,
      },
      pages: result.pages,
    });
  }

  const fragments = (result.fragmentEntryLinks ?? [])
    .filter((entry) => entry.type === 'fragment' && entry.fragmentKey)
    .map((entry) => ({
      fragmentKey: entry.fragmentKey!,
      ...(entry.fragmentSiteFriendlyUrl ? {fragmentSiteFriendlyUrl: entry.fragmentSiteFriendlyUrl} : {}),
      ...(entry.fragmentExportPath ? {fragmentExportPath: entry.fragmentExportPath} : {}),
      ...(entry.configuration ? {configuration: entry.configuration} : {}),
      ...(entry.contentSummary ? {contentSummary: entry.contentSummary} : {}),
      ...(entry.mappedTemplateKeys && entry.mappedTemplateKeys.length > 0
        ? {mappedTemplateKeys: entry.mappedTemplateKeys}
        : {}),
      ...(entry.mappedStructureKeys && entry.mappedStructureKeys.length > 0
        ? {mappedStructureKeys: entry.mappedStructureKeys}
        : {}),
    }));

  const widgets = (result.fragmentEntryLinks ?? [])
    .filter((entry) => entry.type === 'widget' && entry.widgetName)
    .map((entry) => ({
      widgetName: entry.widgetName!,
      ...(entry.portletId ? {portletId: entry.portletId} : {}),
      ...(entry.configuration ? {configuration: entry.configuration} : {}),
    }));

  const portlets = (result.portlets ?? []).map((portlet) => ({
    columnId: portlet.columnId,
    position: portlet.position,
    portletId: portlet.portletId,
    portletName: portlet.portletName,
    ...(portlet.instanceId ? {instanceId: portlet.instanceId} : {}),
    ...(portlet.configuration ? {configuration: portlet.configuration} : {}),
  }));

  const minimalResult = {
    page: {
      type: 'regularPage',
      subtype: result.pageSubtype,
      uiType: result.pageUiType,
      siteName: result.siteName,
      siteFriendlyUrl: result.siteFriendlyUrl,
      groupId: result.groupId,
      url: result.url,
      friendlyUrl: result.friendlyUrl,
      pageName: result.pageName,
      privateLayout: result.privateLayout,
      layoutId: result.layout.layoutId,
      plid: result.layout.plid,
      hidden: result.layout.hidden,
    },
    ...(result.pageSummary ? {summary: result.pageSummary} : {}),
    adminUrls: result.adminUrls,
    ...(result.configurationTabs ? {configuration: result.configurationTabs} : {}),
    ...(result.journalArticles && result.journalArticles.length > 0
      ? {contentRefs: result.journalArticles.map(projectJournalArticleRef)}
      : {}),
    ...(result.evidence && result.evidence.length > 0 ? {evidence: result.evidence} : {}),
    ...(fragments.length > 0 || widgets.length > 0 || portlets.length > 0
      ? {
          components: {
            ...(fragments.length > 0 ? {fragments} : {}),
            ...(widgets.length > 0 ? {widgets} : {}),
            ...(portlets.length > 0 ? {portlets} : {}),
          },
        }
      : {}),
    ...(result.componentInspectionSupported !== undefined
      ? {capabilities: {componentInspectionSupported: result.componentInspectionSupported}}
      : {}),
  };

  if (!options?.full) {
    return validateLiferayInventoryPageJsonResult(minimalResult);
  }

  const fullFragments = (result.fragmentEntryLinks ?? []).filter(
    (entry) => entry.type === 'fragment' && entry.fragmentKey,
  );
  const fullWidgets = (result.fragmentEntryLinks ?? []).filter((entry) => entry.type === 'widget' && entry.widgetName);

  return validateLiferayInventoryPageJsonResult({
    ...minimalResult,
    full: {
      ...(Object.keys(result.layoutDetails).length > 0 ? {layoutDetails: result.layoutDetails} : {}),
      ...(result.configurationRaw ? {configurationRaw: result.configurationRaw} : {}),
      ...(result.portlets && result.portlets.length > 0 ? {portlets: result.portlets} : {}),
      ...(result.journalArticles && result.journalArticles.length > 0 ? {journalArticles: result.journalArticles} : {}),
      ...(result.contentStructures && result.contentStructures.length > 0
        ? {contentStructures: result.contentStructures}
        : {}),
      ...(fullFragments.length > 0 || fullWidgets.length > 0
        ? {
            components: {
              ...(fullFragments.length > 0 ? {fragments: fullFragments} : {}),
              ...(fullWidgets.length > 0 ? {widgets: fullWidgets} : {}),
            },
          }
        : {}),
    },
  });
}
