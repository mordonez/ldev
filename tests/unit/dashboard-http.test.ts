import {describe, expect, test} from 'vitest';

import {getContentType} from '../../src/features/dashboard/dashboard-http.js';

describe('dashboard http', () => {
  test('serves SVG assets with the browser-friendly favicon MIME type', () => {
    expect(getContentType('favicon.svg')).toBe('image/svg+xml');
    expect(getContentType('assets/favicon-OnGGJ7Na.svg')).toBe('image/svg+xml');
  });
});
