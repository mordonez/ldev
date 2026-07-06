export type VerifyStepStatus = 'pass' | 'fail' | 'skipped';

export type VerifyLoginResult = {
  status: VerifyStepStatus;
  detail: string;
};

export type VerifyNavigationResult = {
  status: VerifyStepStatus;
  url: string;
  title: string | null;
  httpStatus: number | null;
  detail: string;
};

export type VerifyConsoleErrorsResult = {
  status: VerifyStepStatus;
  errors: string[];
};

export type VerifyScreenshotResult = {
  status: VerifyStepStatus;
  path: string | null;
  detail: string;
};

export type VerifyDomCheck = {
  id: string;
  status: VerifyStepStatus;
  detail: string;
};

export type VerifyDomSanityResult = {
  status: VerifyStepStatus;
  checks: VerifyDomCheck[];
};

export type VerifyResourceCatalogDiff = {
  resourceType: string;
  key: string;
  detail: string;
};

export type VerifyResourceCatalogResult = {
  status: VerifyStepStatus;
  detail: string;
  diffs: VerifyResourceCatalogDiff[];
};

export type VerifyPageReport = {
  ok: boolean;
  url: string;
  login: VerifyLoginResult;
  navigation: VerifyNavigationResult;
  consoleErrors: VerifyConsoleErrorsResult;
  screenshot: VerifyScreenshotResult;
  domSanity: VerifyDomSanityResult;
  resourceCatalog: VerifyResourceCatalogResult;
};
