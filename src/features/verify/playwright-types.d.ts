/**
 * Minimal ambient typing for the optional `playwright` package.
 *
 * `playwright` is intentionally NOT a declared dependency of this CLI (see
 * verify-browser-runner.ts for the rationale). Declaring this ambient module
 * lets `src/features/verify` type-check and lint cleanly without requiring
 * `playwright` to be installed in every consumer's node_modules. At runtime,
 * `createPlaywrightBrowserRunner` dynamically imports the real package and
 * fails with a clear install message when it is missing.
 *
 * Keep this surface limited to what the runner actually uses.
 */
declare module 'playwright' {
  export interface ConsoleMessage {
    type(): string;
    text(): string;
  }

  export interface Response {
    status(): number;
  }

  export interface Locator {
    fill(value: string): Promise<void>;
    click(): Promise<void>;
    first(): Locator;
  }

  export interface Page {
    goto(url: string, options?: {waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'}): Promise<Response | null>;
    title(): Promise<string>;
    url(): string;
    locator(selector: string): Locator;
    screenshot(options: {path: string; fullPage?: boolean}): Promise<Buffer>;
    evaluate<T>(pageFunction: () => T): Promise<T>;
    on(event: 'console', listener: (message: ConsoleMessage) => void): void;
    waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
    waitForNavigation(options?: {waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'}): Promise<Response | null>;
    close(): Promise<void>;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface BrowserType {
    launch(options?: {headless?: boolean}): Promise<Browser>;
  }

  export const chromium: BrowserType;
}
