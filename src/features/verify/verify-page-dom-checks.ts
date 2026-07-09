import type {BrowserDomSnapshot} from './browser-runner-types.js';
import type {VerifyDomCheck, VerifyDomSanityResult} from './verify-page-types.js';

const MIN_BODY_TEXT_LENGTH = 1;

/**
 * Pure translation of a raw DOM snapshot into pass/fail sanity checks.
 * Kept separate from the orchestrator so the rules can be unit-tested
 * without a browser or fake runner.
 */
export function evaluateDomSanity(snapshot: BrowserDomSnapshot): VerifyDomSanityResult {
  const checks: VerifyDomCheck[] = [
    {
      id: 'has-title',
      status: snapshot.title.trim() !== '' ? 'pass' : 'fail',
      detail: snapshot.title.trim() !== '' ? `Page title: "${snapshot.title}"` : 'Page title is empty.',
    },
    {
      id: 'has-body-content',
      status: snapshot.bodyTextLength >= MIN_BODY_TEXT_LENGTH ? 'pass' : 'fail',
      detail:
        snapshot.bodyTextLength >= MIN_BODY_TEXT_LENGTH
          ? `Body text length: ${snapshot.bodyTextLength}.`
          : 'Body text is empty; the page may have failed to render.',
    },
    {
      id: 'has-heading',
      status: snapshot.headingCount > 0 ? 'pass' : 'fail',
      detail:
        snapshot.headingCount > 0
          ? `Found ${snapshot.headingCount} heading element(s).`
          : 'No h1/h2/h3 heading elements found.',
    },
    {
      id: 'no-visible-error-banner',
      status: snapshot.hasVisibleErrorBanner ? 'fail' : 'pass',
      detail: snapshot.hasVisibleErrorBanner
        ? 'A visible error banner (.alert-danger / .portlet-msg-error) was detected.'
        : 'No visible error banner detected.',
    },
  ];

  return {
    status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
    checks,
  };
}
