export type LocalFragment = {
  slug: string;
  name: string;
  icon: string;
  type: number;
  htmlPath: string;
  cssPath: string;
  jsPath: string;
  configurationPath: string;
  html: string;
  css: string;
  js: string;
  configuration: string;
  directoryPath: string;
};

export type LocalFragmentCollection = {
  slug: string;
  name: string;
  description: string;
  directoryPath: string;
  fragments: LocalFragment[];
};

export type LocalFragmentsProject = {
  projectDir: string;
  collections: LocalFragmentCollection[];
};

export type LiferayResourceImportFragmentItemResult = {
  collection: string;
  fragment: string;
  status: 'imported' | 'error';
  fragmentEntryId?: number;
  error?: string;
};

export type LiferayResourceImportFragmentsSingleResult = {
  mode: 'oauth-jsonws-import';
  site: string;
  siteId: number;
  projectDir: string;
  summary: {
    importedFragments: number;
    fragmentResults: number;
    pageTemplateResults: number;
    errors: number;
  };
  fragmentResults: LiferayResourceImportFragmentItemResult[];
  pageTemplateResults: unknown[];
};

export type LiferayResourceImportFragmentsAllSitesResult = {
  mode: 'all-sites';
  sites: number;
  imported: number;
  errors: number;
  siteResults: LiferayResourceImportFragmentsSingleResult[];
};

export type LiferayResourceImportFragmentsResult =
  | LiferayResourceImportFragmentsSingleResult
  | LiferayResourceImportFragmentsAllSitesResult;
