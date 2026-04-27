import {z} from 'zod';

const contentFieldSummarySchema = z.object({
  path: z.string(),
  label: z.string(),
  name: z.string(),
  type: z.string(),
  value: z.string(),
});

const journalArticleSummarySchema = z.object({
  groupId: z.number().optional(),
  siteFriendlyUrl: z.string().optional(),
  siteName: z.string().optional(),
  articleId: z.string(),
  title: z.string(),
  ddmStructureKey: z.string(),
  ddmTemplateKey: z.string().optional(),
  ddmStructureSiteFriendlyUrl: z.string().optional(),
  ddmTemplateSiteFriendlyUrl: z.string().optional(),
  structureExportPath: z.string().optional(),
  templateExportPath: z.string().optional(),
  contentStructureId: z.number().optional(),
  contentFields: z.array(contentFieldSummarySchema).optional(),
  widgetDefaultTemplate: z.string().optional(),
  widgetHeadlessDefaultTemplate: z.string().optional(),
  displayPageDefaultTemplate: z.string().optional(),
  widgetTemplateCandidates: z.array(z.string()).optional(),
  displayPageTemplateCandidates: z.array(z.string()).optional(),
  displayPageDdmTemplates: z.array(z.string()).optional(),
  taxonomyCategoryNames: z.array(z.string()).optional(),
  taxonomyCategoryBriefs: z.array(z.record(z.string(), z.unknown())).optional(),
  renderedContents: z.array(z.record(z.string(), z.unknown())).optional(),
  availableLanguages: z.array(z.string()).optional(),
  dateCreated: z.string().optional(),
  dateModified: z.string().optional(),
  datePublished: z.string().optional(),
  expirationDate: z.string().optional(),
  reviewDate: z.string().optional(),
  description: z.string().optional(),
  externalReferenceCode: z.string().optional(),
  siteId: z.number().optional(),
  structuredContentFolderId: z.number().optional(),
  uuid: z.string().optional(),
  priority: z.number().optional(),
  neverExpire: z.boolean().optional(),
  subscribed: z.boolean().optional(),
  relatedContentsCount: z.number().optional(),
});

const contentStructureSummarySchema = z.object({
  contentStructureId: z.number(),
  key: z.string().optional(),
  name: z.string(),
  siteFriendlyUrl: z.string().optional(),
  exportPath: z.string().optional(),
});

const pageFragmentEntrySchema = z.object({
  type: z.enum(['fragment', 'widget']),
  fragmentKey: z.string().optional(),
  fragmentSiteFriendlyUrl: z.string().optional(),
  fragmentExportPath: z.string().optional(),
  widgetName: z.string().optional(),
  portletId: z.string().optional(),
  configuration: z.record(z.string(), z.string()).optional(),
  editableFields: z.array(z.object({id: z.string(), value: z.string()})).optional(),
  contentSummary: z.string().optional(),
  title: z.string().optional(),
  heroText: z.string().optional(),
  navigationItems: z.array(z.string()).optional(),
  cardCount: z.number().optional(),
  elementName: z.string().optional(),
  cssClasses: z.array(z.string()).optional(),
  customCSS: z.string().optional(),
});

const siteRootResultSchema = z.object({
  pageType: z.literal('siteRoot'),
  siteName: z.string(),
  siteFriendlyUrl: z.string(),
  groupId: z.number(),
  url: z.string(),
  pages: z.array(
    z.object({
      layoutId: z.number(),
      friendlyUrl: z.string(),
      name: z.string(),
      type: z.string(),
    }),
  ),
});

const displayPageResultSchema = z.object({
  pageType: z.literal('displayPage'),
  pageSubtype: z.literal('journalArticle'),
  contentItemType: z.literal('WebContent'),
  siteName: z.string(),
  siteFriendlyUrl: z.string(),
  groupId: z.number(),
  url: z.string(),
  friendlyUrl: z.string(),
  article: z.object({
    id: z.number(),
    key: z.string(),
    title: z.string(),
    friendlyUrlPath: z.string(),
    contentStructureId: z.number(),
  }),
  adminUrls: z
    .object({
      edit: z.string(),
      translate: z.string(),
    })
    .optional(),
  journalArticles: z.array(journalArticleSummarySchema).optional(),
  contentStructures: z.array(contentStructureSummarySchema).optional(),
});

const regularPageResultSchema = z.object({
  pageType: z.literal('regularPage'),
  pageSubtype: z.string(),
  pageUiType: z.string(),
  siteName: z.string(),
  siteFriendlyUrl: z.string(),
  groupId: z.number(),
  url: z.string(),
  friendlyUrl: z.string(),
  matchedLocale: z.string().optional(),
  requestedFriendlyUrl: z.string().optional(),
  pageName: z.string(),
  privateLayout: z.boolean(),
  pageSummary: z
    .object({
      layoutTemplateId: z.string().optional(),
      targetUrl: z.string().optional(),
      fragmentCount: z.number(),
      widgetCount: z.number(),
    })
    .optional(),
  layout: z.object({
    layoutId: z.number(),
    plid: z.number(),
    friendlyUrl: z.string(),
    type: z.string(),
    hidden: z.boolean(),
  }),
  adminUrls: z.object({
    view: z.string(),
    edit: z.string(),
    configureGeneral: z.string(),
    configureDesign: z.string(),
    configureSeo: z.string(),
    configureOpenGraph: z.string(),
    configureCustomMetaTags: z.string(),
    translate: z.string(),
  }),
  layoutDetails: z.object({
    layoutTemplateId: z.string().optional(),
    targetUrl: z.string().optional(),
  }),
  configurationTabs: z
    .object({
      general: z.record(z.string(), z.unknown()),
      design: z.record(z.string(), z.unknown()),
      seo: z.record(z.string(), z.unknown()),
      openGraph: z.record(z.string(), z.unknown()),
      customMetaTags: z.record(z.string(), z.unknown()),
    })
    .optional(),
  configurationRaw: z
    .object({
      layout: z.record(z.string(), z.unknown()),
      typeSettings: z.record(z.string(), z.string()),
      sitePageMetadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  componentInspectionSupported: z.boolean().optional(),
  portlets: z
    .array(
      z.object({
        columnId: z.string(),
        position: z.number(),
        portletId: z.string(),
        portletName: z.string(),
        instanceId: z.string().optional(),
        configuration: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
  fragmentEntryLinks: z.array(pageFragmentEntrySchema).optional(),
  widgets: z
    .array(
      z.object({
        widgetName: z.string(),
        portletId: z.string().optional(),
        configuration: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
  journalArticles: z.array(journalArticleSummarySchema).optional(),
  contentStructures: z.array(contentStructureSummarySchema).optional(),
});

export const liferayInventoryPageResultV2Schema = z.discriminatedUnion('pageType', [
  siteRootResultSchema,
  displayPageResultSchema,
  regularPageResultSchema,
]);

export type LiferayInventoryPageResultV2 = z.infer<typeof liferayInventoryPageResultV2Schema>;

export function validateLiferayInventoryPageResultV2(result: unknown): LiferayInventoryPageResultV2 {
  return liferayInventoryPageResultV2Schema.parse(result);
}
