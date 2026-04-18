import type {
  ContentStructureSummary,
  JournalArticleSummary,
  PageFragmentEntry,
} from './liferay-inventory-page-assemble.js';
import type {
  InventoryPageConfigurationTabs,
  LiferayInventoryPageResult,
  PagePortletSummary,
} from './liferay-inventory-page.js';

export function formatLiferayInventoryPage(result: LiferayInventoryPageResult, verbose = false): string {
  if (result.pageType === 'siteRoot') {
    const lines = [
      'SITE ROOT',
      `site=${result.siteName}`,
      `siteFriendlyUrl=${result.siteFriendlyUrl}`,
      `groupId=${result.groupId}`,
      `url=${result.url}`,
      `pages=${result.pages.length}`,
    ];
    for (const page of result.pages) {
      lines.push(`- layoutId=${page.layoutId} type=${page.type} friendlyUrl=${page.friendlyUrl} name=${page.name}`);
    }
    return lines.join('\n');
  }

  if (result.pageType === 'displayPage') {
    const firstArticle = result.journalArticles?.[0];
    const lines = [
      'DISPLAY PAGE',
      `site=${result.siteName}`,
      `siteFriendlyUrl=${result.siteFriendlyUrl}`,
      `groupId=${result.groupId}`,
      `url=${result.url}`,
      `friendlyUrl=${result.friendlyUrl}`,
      ...(firstArticle?.ddmStructureKey ? [`structureKey=${firstArticle.ddmStructureKey}`] : []),
      ...(firstArticle?.widgetDefaultTemplate ? [`templateWidgetDefault=${firstArticle.widgetDefaultTemplate}`] : []),
      ...(firstArticle?.displayPageDefaultTemplate
        ? [`templateDisplayPageDefault=${firstArticle.displayPageDefaultTemplate}`]
        : []),
      `articleId=${result.article.id}`,
      `articleKey=${result.article.key}`,
      `articleTitle=${result.article.title}`,
      `contentStructureId=${result.article.contentStructureId}`,
      ...(result.adminUrls ? [`editUrl=${result.adminUrls.edit}`] : []),
      ...(result.adminUrls ? [`translateUrl=${result.adminUrls.translate}`] : []),
    ];
    if (firstArticle?.taxonomyCategoryNames?.length) {
      lines.push(`categories=${firstArticle.taxonomyCategoryNames.join(', ')}`);
    }
    if (firstArticle?.datePublished) {
      lines.push(`datePublished=${firstArticle.datePublished}`);
    }
    if (typeof firstArticle?.priority === 'number') {
      lines.push(`priority=${firstArticle.priority}`);
    }
    appendJournalArticleLines(lines, result.journalArticles);
    appendContentStructureLines(lines, result.contentStructures);
    return lines.join('\n');
  }

  const lines = [
    'REGULAR PAGE',
    `site=${result.siteName}`,
    `siteFriendlyUrl=${result.siteFriendlyUrl}`,
    `groupId=${result.groupId}`,
    `friendlyUrl=${result.friendlyUrl}`,
    `url=${result.url}`,
    ...(result.matchedLocale ? [`locale=${result.matchedLocale}`, `requestedUrl=${result.requestedFriendlyUrl}`] : []),
    `pageName=${result.pageName}`,
    `layoutType=${result.pageSubtype}`,
    `layoutId=${result.layout.layoutId}`,
    `plid=${result.layout.plid}`,
    `hidden=${result.layout.hidden}`,
    `privateLayout=${result.privateLayout}`,
    `viewUrl=${result.adminUrls.view}`,
    `editUrl=${result.adminUrls.edit}`,
    `configureGeneralUrl=${result.adminUrls.configureGeneral}`,
    `configureDesignUrl=${result.adminUrls.configureDesign}`,
    `configureSeoUrl=${result.adminUrls.configureSeo}`,
    `configureOpenGraphUrl=${result.adminUrls.configureOpenGraph}`,
    `configureCustomMetaTagsUrl=${result.adminUrls.configureCustomMetaTags}`,
    `translateUrl=${result.adminUrls.translate}`,
  ];

  if (result.pageSummary) {
    lines.push('PAGE SUMMARY');
    lines.push(`layoutTemplateId=${result.pageSummary.layoutTemplateId ?? '-'}`);
    lines.push(`targetUrl=${result.pageSummary.targetUrl ?? '-'}`);
    lines.push(`fragmentCount=${result.pageSummary.fragmentCount}`);
    lines.push(`widgetCount=${result.pageSummary.widgetCount}`);
  }

  if (result.layoutDetails.layoutTemplateId) {
    lines.push(`layoutTemplateId=${result.layoutDetails.layoutTemplateId}`);
  }
  if (result.layoutDetails.targetUrl) {
    lines.push(`targetUrl=${result.layoutDetails.targetUrl}`);
  }
  if (result.configurationTabs) {
    appendConfigurationTabsLines(lines, result.configurationTabs);
  }
  appendPortletLines(lines, result.portlets);
  if (result.fragmentEntryLinks && result.fragmentEntryLinks.length > 0) {
    appendFragmentEntryLines(lines, result.fragmentEntryLinks, verbose);
  }
  appendJournalArticleLines(lines, result.journalArticles);
  appendContentStructureLines(lines, result.contentStructures);

  return lines.join('\n');
}

function appendConfigurationTabsLines(lines: string[], configurationTabs: InventoryPageConfigurationTabs): void {
  lines.push(`CONFIGURATION TABS`);
  lines.push(`general=${JSON.stringify(configurationTabs.general)}`);
  lines.push(`design=${JSON.stringify(configurationTabs.design)}`);
  lines.push(`seo=${JSON.stringify(configurationTabs.seo)}`);
  lines.push(`openGraph=${JSON.stringify(configurationTabs.openGraph)}`);
  lines.push(`customMetaTags=${JSON.stringify(configurationTabs.customMetaTags)}`);
}

function appendFragmentEntryLines(lines: string[], fragmentEntryLinks: PageFragmentEntry[], verbose: boolean): void {
  lines.push(`FRAGMENTS (${fragmentEntryLinks.length})`);
  let i = 1;
  for (const entry of fragmentEntryLinks) {
    if (entry.type === 'widget') {
      lines.push(`${i++}. ${entry.widgetName}`);
      if (entry.portletId && entry.portletId !== entry.widgetName) {
        lines.push(`   portletId=${entry.portletId}`);
      }
    } else {
      lines.push(`${i++}. ${entry.fragmentKey}`);
      if (entry.fragmentSiteFriendlyUrl) {
        lines.push(`   site=${entry.fragmentSiteFriendlyUrl}`);
      }
      if (entry.fragmentExportPath) {
        lines.push(`   exportPath=${entry.fragmentExportPath}`);
      }
      if (entry.title) {
        lines.push(`   title=${entry.title}`);
      }
      if (entry.heroText) {
        lines.push(`   heroText=${entry.heroText}`);
      }
      if (entry.navigationItems && entry.navigationItems.length > 0) {
        lines.push(`   navigationItems=${entry.navigationItems.join(' | ')}`);
      }
      if (typeof entry.cardCount === 'number') {
        lines.push(`   cardCount=${entry.cardCount}`);
      }
      if (entry.contentSummary) {
        lines.push(`   summary=${entry.contentSummary}`);
      }
    }
    if (verbose && entry.elementName) {
      lines.push(`   name=${entry.elementName}`);
    }
    if (entry.editableFields) {
      for (const field of entry.editableFields) {
        lines.push(`   [${field.id}] ${field.value}`);
      }
    }
    if (entry.configuration) {
      for (const [key, value] of Object.entries(entry.configuration)) {
        lines.push(`   ${key}=${value}`);
      }
    }
    if (verbose && entry.cssClasses && entry.cssClasses.length > 0) {
      lines.push(`   cssClasses=${entry.cssClasses.join(' ')}`);
    }
    if (verbose && entry.customCSS) {
      lines.push(`   customCSS=${entry.customCSS.replace(/\s+/g, ' ')}`);
    }
  }
}

function appendPortletLines(lines: string[], portlets?: PagePortletSummary[]): void {
  if (!portlets || portlets.length === 0) {
    return;
  }

  lines.push(`PORTLETS (${portlets.length})`);
  let i = 1;
  for (const portlet of portlets) {
    lines.push(`${i++}. ${portlet.portletName}`);
    lines.push(`   portletId=${portlet.portletId}`);
    if (portlet.instanceId) {
      lines.push(`   instanceId=${portlet.instanceId}`);
    }
    for (const [key, value] of Object.entries(portlet.configuration ?? {})) {
      lines.push(`   ${key}=${value}`);
    }
  }
}

function appendJournalArticleLines(lines: string[], journalArticles?: JournalArticleSummary[]): void {
  if (!journalArticles || journalArticles.length === 0) {
    return;
  }

  lines.push(`journalArticles=${journalArticles.length}`);
  for (const article of journalArticles) {
    lines.push(`article ${article.articleId} title=${article.title} structure=${article.ddmStructureKey}`);
    if (article.siteFriendlyUrl || article.groupId) {
      lines.push(`  articleSite=${article.siteFriendlyUrl ?? '?'} groupId=${article.groupId ?? '?'}`);
    }
    if (article.ddmStructureSiteFriendlyUrl || article.structureExportPath) {
      lines.push(
        `  structureSite=${article.ddmStructureSiteFriendlyUrl ?? '?'}${article.structureExportPath ? ` export=${article.structureExportPath}` : ''}`,
      );
    }
    if (article.ddmTemplateKey && (article.ddmTemplateSiteFriendlyUrl || article.templateExportPath)) {
      lines.push(
        `  template ${article.ddmTemplateKey} site=${article.ddmTemplateSiteFriendlyUrl ?? '?'}${article.templateExportPath ? ` export=${article.templateExportPath}` : ''}`,
      );
    }
    if (article.widgetDefaultTemplate || article.displayPageDefaultTemplate) {
      lines.push(
        `  templates widgetDefault=${article.widgetDefaultTemplate ?? '-'} displayPageDefault=${article.displayPageDefaultTemplate ?? '-'}`,
      );
    }
    if (article.taxonomyCategoryNames && article.taxonomyCategoryNames.length > 0) {
      lines.push(`  categories=${article.taxonomyCategoryNames.join(', ')}`);
    }
    if (article.datePublished || article.dateModified) {
      lines.push(`  dates published=${article.datePublished ?? '-'} modified=${article.dateModified ?? '-'}`);
    }
    for (const field of article.contentFields ?? []) {
      lines.push(`contentField ${field.path}=${field.value}`);
    }
  }
}

function appendContentStructureLines(lines: string[], contentStructures?: ContentStructureSummary[]): void {
  if (!contentStructures || contentStructures.length === 0) {
    return;
  }

  lines.push(`contentStructures=${contentStructures.length}`);
  for (const structure of contentStructures) {
    lines.push(
      `structure ${structure.key ?? structure.contentStructureId} site=${structure.siteFriendlyUrl ?? '?'} id=${structure.contentStructureId} name=${structure.name}${structure.exportPath ? ` export=${structure.exportPath}` : ''}`,
    );
  }
}
