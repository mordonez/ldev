import type {JournalArticleSummary} from './liferay-inventory-page-assemble.js';
import {
  validateLiferayInventoryPageJsonResult,
  type LiferayInventoryPageJsonResult,
} from './liferay-inventory-page-json-schema.js';
import type {LiferayInventoryPageResult} from './liferay-inventory-page.js';

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

function projectDisplayPageJson(
  result: Extract<LiferayInventoryPageResult, {pageType: 'displayPage'}>,
  options?: {full?: boolean},
): LiferayInventoryPageJsonResult {
  const articleDetails = result.journalArticles?.[0];
  const contentSummary = buildDisplayContentSummary(articleDetails, result.article.title);
  const rendering = buildDisplayRendering(articleDetails);
  const taxonomy =
    articleDetails?.taxonomyCategoryNames && articleDetails.taxonomyCategoryNames.length > 0
      ? {categories: articleDetails.taxonomyCategoryNames}
      : undefined;
  const lifecycle = buildDisplayLifecycle(articleDetails);

  const minimalResult = {
    page: {
      type: 'displayPage',
      subtype: 'journalArticle',
      contentItemType: 'WebContent',
      siteName: result.siteName,
      siteFriendlyUrl: result.siteFriendlyUrl,
      groupId: result.groupId,
      url: result.url,
      friendlyUrl: result.friendlyUrl,
    },
    article: {
      id: result.article.id,
      key: result.article.key,
      title: result.article.title,
      friendlyUrlPath: result.article.friendlyUrlPath,
      contentStructureId: result.article.contentStructureId,
      ...(articleDetails?.discoverySource ? {discoverySource: articleDetails.discoverySource} : {}),
      ...(articleDetails?.groupId ? {groupId: articleDetails.groupId} : {}),
      ...(articleDetails?.siteId ? {siteId: articleDetails.siteId} : {}),
      ...(articleDetails?.siteFriendlyUrl ? {siteFriendlyUrl: articleDetails.siteFriendlyUrl} : {}),
      ...(articleDetails?.siteName ? {siteName: articleDetails.siteName} : {}),
      ...(articleDetails?.ddmStructureKey ? {structureKey: articleDetails.ddmStructureKey} : {}),
      ...(articleDetails?.ddmStructureSiteFriendlyUrl
        ? {structureSiteFriendlyUrl: articleDetails.ddmStructureSiteFriendlyUrl}
        : {}),
      ...(articleDetails?.structureExportPath ? {structureExportPath: articleDetails.structureExportPath} : {}),
      ...(articleDetails?.ddmTemplateKey ? {templateKey: articleDetails.ddmTemplateKey} : {}),
      ...(articleDetails?.ddmTemplateSiteFriendlyUrl
        ? {templateSiteFriendlyUrl: articleDetails.ddmTemplateSiteFriendlyUrl}
        : {}),
      ...(articleDetails?.templateExportPath ? {templateExportPath: articleDetails.templateExportPath} : {}),
      ...(articleDetails?.externalReferenceCode ? {externalReferenceCode: articleDetails.externalReferenceCode} : {}),
      ...(articleDetails?.uuid ? {uuid: articleDetails.uuid} : {}),
    },
    ...(result.adminUrls ? {adminUrls: result.adminUrls} : {}),
    ...(contentSummary ? {contentSummary} : {}),
    ...(rendering ? {rendering} : {}),
    ...(taxonomy ? {taxonomy} : {}),
    ...(lifecycle ? {lifecycle} : {}),
    ...(result.evidence && result.evidence.length > 0 ? {evidence: result.evidence} : {}),
  };

  if (!options?.full) {
    return minimalResult as LiferayInventoryPageJsonResult;
  }

  return {
    ...minimalResult,
    full: {
      ...(articleDetails
        ? {
            articleDetails: {
              ...(articleDetails.contentFields && articleDetails.contentFields.length > 0
                ? {contentFields: articleDetails.contentFields}
                : {}),
              ...(articleDetails.widgetTemplateCandidates && articleDetails.widgetTemplateCandidates.length > 0
                ? {widgetTemplateCandidates: articleDetails.widgetTemplateCandidates}
                : {}),
              ...(articleDetails.displayPageTemplateCandidates &&
              articleDetails.displayPageTemplateCandidates.length > 0
                ? {displayPageTemplateCandidates: articleDetails.displayPageTemplateCandidates}
                : {}),
              ...(articleDetails.taxonomyCategoryBriefs && articleDetails.taxonomyCategoryBriefs.length > 0
                ? {taxonomyCategoryBriefs: articleDetails.taxonomyCategoryBriefs}
                : {}),
              ...(articleDetails.renderedContents && articleDetails.renderedContents.length > 0
                ? {renderedContents: articleDetails.renderedContents}
                : {}),
            },
          }
        : {}),
      ...(result.contentStructures && result.contentStructures.length > 0
        ? {contentStructures: result.contentStructures}
        : {}),
    },
  } as LiferayInventoryPageJsonResult;
}

function buildDisplayContentSummary(articleDetails: JournalArticleSummary | undefined, fallbackTitle: string) {
  const headline = articleDetails?.title ? truncateText(stripHtml(articleDetails.title), 240) : fallbackTitle;
  const lead = articleDetails?.description ? truncateText(stripHtml(articleDetails.description), 240) : undefined;

  if (!headline && !lead) {
    return undefined;
  }

  return {
    ...(headline ? {headline: decodeHtmlEntities(headline)} : {}),
    ...(lead ? {lead: decodeHtmlEntities(lead)} : {}),
  };
}

function projectJournalArticleRef(article: JournalArticleSummary) {
  return {
    articleId: article.articleId,
    title: article.title,
    ...(article.discoverySource ? {discoverySource: article.discoverySource} : {}),
    ...(article.groupId ? {groupId: article.groupId} : {}),
    ...(article.siteId ? {siteId: article.siteId} : {}),
    ...(article.siteFriendlyUrl ? {siteFriendlyUrl: article.siteFriendlyUrl} : {}),
    ...(article.siteName ? {siteName: article.siteName} : {}),
    ...(article.ddmStructureKey ? {structureKey: article.ddmStructureKey} : {}),
    ...(article.ddmStructureSiteFriendlyUrl ? {structureSiteFriendlyUrl: article.ddmStructureSiteFriendlyUrl} : {}),
    ...(article.structureExportPath ? {structureExportPath: article.structureExportPath} : {}),
    ...(article.contentStructureId ? {contentStructureId: article.contentStructureId} : {}),
    ...(article.ddmTemplateKey ? {templateKey: article.ddmTemplateKey} : {}),
    ...(article.ddmTemplateSiteFriendlyUrl ? {templateSiteFriendlyUrl: article.ddmTemplateSiteFriendlyUrl} : {}),
    ...(article.templateExportPath ? {templateExportPath: article.templateExportPath} : {}),
    ...(article.widgetDefaultTemplate ? {widgetDefaultTemplate: article.widgetDefaultTemplate} : {}),
    ...(article.displayPageDefaultTemplate ? {displayPageDefaultTemplate: article.displayPageDefaultTemplate} : {}),
  };
}

function buildDisplayRendering(articleDetails?: JournalArticleSummary) {
  if (!articleDetails) {
    return undefined;
  }

  const derivedDisplayPageTemplate = articleDetails.renderedContents
    ?.map((item) => item as Record<string, unknown>)
    .find(
      (candidate) =>
        candidate.markedAsDefault === true &&
        typeof candidate.contentTemplateName === 'string' &&
        typeof candidate.renderedContentURL === 'string' &&
        candidate.renderedContentURL.includes('/rendered-content-by-display-page/'),
    );
  const displayPageDefaultTemplate =
    articleDetails.displayPageDefaultTemplate ??
    (derivedDisplayPageTemplate?.contentTemplateName as string | undefined);

  const hasWidgetRendering = Boolean(
    articleDetails.widgetDefaultTemplate ||
    articleDetails.widgetHeadlessDefaultTemplate ||
    articleDetails.widgetTemplateCandidates?.length,
  );
  const hasDisplayPageRendering = Boolean(
    displayPageDefaultTemplate || articleDetails.displayPageTemplateCandidates?.length,
  );

  if (!hasWidgetRendering && !hasDisplayPageRendering) {
    return undefined;
  }

  return {
    ...(articleDetails.widgetDefaultTemplate ? {widgetDefaultTemplate: articleDetails.widgetDefaultTemplate} : {}),
    ...(displayPageDefaultTemplate ? {displayPageDefaultTemplate} : {}),
    ...(articleDetails.displayPageDdmTemplates && articleDetails.displayPageDdmTemplates.length > 0
      ? {displayPageDdmTemplates: articleDetails.displayPageDdmTemplates}
      : {}),
    hasWidgetRendering,
    hasDisplayPageRendering,
  };
}

function buildDisplayLifecycle(articleDetails?: JournalArticleSummary) {
  if (!articleDetails) {
    return undefined;
  }

  if (
    !articleDetails.availableLanguages?.length &&
    !articleDetails.dateCreated &&
    !articleDetails.dateModified &&
    !articleDetails.datePublished &&
    articleDetails.neverExpire === undefined
  ) {
    return undefined;
  }

  return {
    ...(articleDetails.availableLanguages?.length ? {availableLanguages: articleDetails.availableLanguages} : {}),
    ...(articleDetails.dateCreated ? {dateCreated: articleDetails.dateCreated} : {}),
    ...(articleDetails.dateModified ? {dateModified: articleDetails.dateModified} : {}),
    ...(articleDetails.datePublished ? {datePublished: articleDetails.datePublished} : {}),
    ...(articleDetails.neverExpire !== undefined ? {neverExpire: articleDetails.neverExpire} : {}),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  return value
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => entityMap[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}
