import {describe, expect, test} from 'vitest';

import {evaluateDomSanity} from '../../src/features/verify/verify-page-dom-checks.js';
import type {BrowserDomSnapshot} from '../../src/features/verify/browser-runner-types.js';

const HEALTHY_SNAPSHOT: BrowserDomSnapshot = {
  title: 'Guest Home',
  bodyTextLength: 500,
  headingCount: 2,
  hasVisibleErrorBanner: false,
};

describe('evaluateDomSanity', () => {
  test('passes all checks for a healthy snapshot', () => {
    const result = evaluateDomSanity(HEALTHY_SNAPSHOT);

    expect(result.status).toBe('pass');
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true);
  });

  test('fails when the title is empty', () => {
    const result = evaluateDomSanity({...HEALTHY_SNAPSHOT, title: '  '});

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'has-title')?.status).toBe('fail');
  });

  test('fails when body text is empty', () => {
    const result = evaluateDomSanity({...HEALTHY_SNAPSHOT, bodyTextLength: 0});

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'has-body-content')?.status).toBe('fail');
  });

  test('fails when no heading elements are present', () => {
    const result = evaluateDomSanity({...HEALTHY_SNAPSHOT, headingCount: 0});

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'has-heading')?.status).toBe('fail');
  });

  test('fails when a visible error banner is detected', () => {
    const result = evaluateDomSanity({...HEALTHY_SNAPSHOT, hasVisibleErrorBanner: true});

    expect(result.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'no-visible-error-banner')?.status).toBe('fail');
  });
});
