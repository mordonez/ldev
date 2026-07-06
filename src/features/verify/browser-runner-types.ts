/**
 * Injectable browser runner contract used by `ldev verify page`.
 *
 * Keeping this as a narrow interface lets the orchestration in verify-page.ts
 * be unit-tested against a fake implementation, with no real browser involved.
 * `createPlaywrightBrowserRunner` (verify-browser-runner.ts) is the only
 * production implementation.
 */
export type BrowserNavigationResult = {
  url: string;
  title: string;
  status: number | null;
};

export type BrowserDomSnapshot = {
  title: string;
  bodyTextLength: number;
  headingCount: number;
  hasVisibleErrorBanner: boolean;
};

export type BrowserLoginCredentials = {
  email: string;
  password: string;
};

export interface BrowserRunner {
  /** Navigate to a login page and submit credentials using Liferay's default login form ids. */
  login(loginUrl: string, credentials: BrowserLoginCredentials): Promise<BrowserNavigationResult>;
  /** Navigate to the target URL. */
  open(url: string): Promise<BrowserNavigationResult>;
  /** Console errors observed since the runner was created. */
  getConsoleErrors(): Promise<string[]>;
  /** Capture a full-page screenshot to the given path. */
  captureScreenshot(path: string): Promise<void>;
  /** Lightweight DOM sanity snapshot of the current page. */
  getDomSnapshot(): Promise<BrowserDomSnapshot>;
  /** Release all browser resources. Must be safe to call multiple times. */
  close(): Promise<void>;
}
