import {z} from 'zod';

const siteRootJsonSchema = z.object({
  page: z.object({
    type: z.literal('siteRoot'),
    siteName: z.string().optional(),
    siteFriendlyUrl: z.string(),
    groupId: z.number(),
    url: z.string(),
  }),
  pages: z.array(
    z.object({
      layoutId: z.number(),
      friendlyUrl: z.string(),
      name: z.string(),
      type: z.string(),
    }),
  ),
});

const regularPageJsonSchema = z.object({
  page: z.object({
    type: z.literal('regularPage'),
    subtype: z.string(),
    uiType: z.string(),
    siteName: z.string(),
    siteFriendlyUrl: z.string(),
    groupId: z.number(),
    url: z.string(),
    friendlyUrl: z.string(),
    pageName: z.string(),
    privateLayout: z.boolean(),
    layoutId: z.number(),
    plid: z.number(),
    hidden: z.boolean(),
  }),
  summary: z
    .object({
      layoutTemplateId: z.string().optional(),
      targetUrl: z.string().optional(),
      fragmentCount: z.number(),
      widgetCount: z.number(),
    })
    .optional(),
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
  configuration: z
    .object({
      general: z.record(z.string(), z.unknown()),
      design: z.record(z.string(), z.unknown()),
      seo: z.record(z.string(), z.unknown()),
      openGraph: z.record(z.string(), z.unknown()),
      customMetaTags: z.record(z.string(), z.unknown()),
    })
    .optional(),
  components: z
    .object({
      fragments: z
        .array(
          z.object({
            fragmentKey: z.string(),
            fragmentSiteFriendlyUrl: z.string().optional(),
            fragmentExportPath: z.string().optional(),
            configuration: z.record(z.string(), z.string()).optional(),
            contentSummary: z.string().optional(),
          }),
        )
        .optional(),
      widgets: z
        .array(
          z.object({
            widgetName: z.string(),
            portletId: z.string().optional(),
            configuration: z.record(z.string(), z.string()).optional(),
          }),
        )
        .optional(),
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
    })
    .optional(),
  contentRefs: z
    .array(
      z.object({
        articleId: z.string(),
        title: z.string(),
        groupId: z.number().optional(),
        siteId: z.number().optional(),
        siteFriendlyUrl: z.string().optional(),
        siteName: z.string().optional(),
        structureKey: z.string().optional(),
        structureSiteFriendlyUrl: z.string().optional(),
        structureExportPath: z.string().optional(),
        contentStructureId: z.number().optional(),
        templateKey: z.string().optional(),
        templateSiteFriendlyUrl: z.string().optional(),
        templateExportPath: z.string().optional(),
        widgetDefaultTemplate: z.string().optional(),
        displayPageDefaultTemplate: z.string().optional(),
      }),
    )
    .optional(),
  capabilities: z.object({componentInspectionSupported: z.boolean()}).optional(),
  full: z
    .object({
      layoutDetails: z
        .object({
          layoutTemplateId: z.string().optional(),
          targetUrl: z.string().optional(),
        })
        .optional(),
      configurationRaw: z.record(z.string(), z.unknown()).optional(),
      portlets: z.array(z.record(z.string(), z.unknown())).optional(),
      journalArticles: z.array(z.record(z.string(), z.unknown())).optional(),
      contentStructures: z.array(z.record(z.string(), z.unknown())).optional(),
      components: z
        .object({
          fragments: z.array(z.record(z.string(), z.unknown())).optional(),
          widgets: z.array(z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
    })
    .optional(),
});

const displayPageJsonSchema = z.object({
  page: z.object({
    type: z.literal('displayPage'),
    subtype: z.literal('journalArticle'),
    contentItemType: z.literal('WebContent'),
    siteName: z.string(),
    siteFriendlyUrl: z.string(),
    groupId: z.number(),
    url: z.string(),
    friendlyUrl: z.string(),
  }),
  article: z.object({
    id: z.number(),
    key: z.string(),
    title: z.string(),
    friendlyUrlPath: z.string(),
    contentStructureId: z.number(),
    groupId: z.number().optional(),
    siteId: z.number().optional(),
    siteFriendlyUrl: z.string().optional(),
    siteName: z.string().optional(),
    structureKey: z.string().optional(),
    structureSiteFriendlyUrl: z.string().optional(),
    structureExportPath: z.string().optional(),
    templateKey: z.string().optional(),
    templateSiteFriendlyUrl: z.string().optional(),
    templateExportPath: z.string().optional(),
    externalReferenceCode: z.string().optional(),
    uuid: z.string().optional(),
  }),
  adminUrls: z
    .object({
      edit: z.string(),
      translate: z.string(),
    })
    .optional(),
  contentSummary: z
    .object({
      headline: z.string().optional(),
      lead: z.string().optional(),
    })
    .optional(),
  rendering: z
    .object({
      widgetDefaultTemplate: z.string().optional(),
      displayPageDefaultTemplate: z.string().optional(),
      displayPageDdmTemplates: z.array(z.string()).optional(),
      hasWidgetRendering: z.boolean(),
      hasDisplayPageRendering: z.boolean(),
    })
    .optional(),
  taxonomy: z.object({categories: z.array(z.string())}).optional(),
  lifecycle: z
    .object({
      availableLanguages: z.array(z.string()).optional(),
      dateCreated: z.string().optional(),
      dateModified: z.string().optional(),
      datePublished: z.string().optional(),
      neverExpire: z.boolean().optional(),
    })
    .optional(),
  full: z
    .object({
      articleDetails: z
        .object({
          contentFields: z.array(z.record(z.string(), z.unknown())).optional(),
          widgetTemplateCandidates: z.array(z.string()).optional(),
          displayPageTemplateCandidates: z.array(z.string()).optional(),
          taxonomyCategoryBriefs: z.array(z.record(z.string(), z.unknown())).optional(),
          renderedContents: z.array(z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
      contentStructures: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .optional(),
});

export const liferayInventoryPageJsonSchema = z.union([
  siteRootJsonSchema,
  regularPageJsonSchema,
  displayPageJsonSchema,
]);

export type LiferayInventoryPageJsonResult = z.infer<typeof liferayInventoryPageJsonSchema>;

export function validateLiferayInventoryPageJsonResult(result: unknown): LiferayInventoryPageJsonResult {
  return liferayInventoryPageJsonSchema.parse(result);
}
