/**
 * Minimal ambient DOM globals for the callback passed to Playwright's
 * `page.evaluate` in verify-browser-runner.ts.
 *
 * That callback is serialized and executed inside the real browser, not in
 * this Node process, so the project's Node-only `lib` (ES2022, no "dom")
 * has no notion of `document`. Only the surface actually touched by the
 * evaluate callback is declared here.
 */
declare const document: {
  title: string;
  body: {readonly innerText: string} | null;
  querySelectorAll(selectors: string): {length: number};
  querySelector(selectors: string): unknown;
};
