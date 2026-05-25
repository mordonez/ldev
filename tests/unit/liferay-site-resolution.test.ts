import {describe, expect, test} from 'vitest';

import {normalizeFriendlyUrl} from '../../src/features/liferay/portal/site-resolution.js';

describe('normalizeFriendlyUrl', () => {
  test('keeps normal friendly URLs stable', () => {
    expect(normalizeFriendlyUrl('estudis')).toBe('/estudis');
    expect(normalizeFriendlyUrl('/estudis')).toBe('/estudis');
  });

  test('recovers friendly URLs converted by Git Bash path rewriting on Windows', () => {
    expect(normalizeFriendlyUrl('C:/Program Files/Git/estudis')).toBe('/estudis');
    expect(normalizeFriendlyUrl('C:\\Program Files\\Git\\departaments')).toBe('/departaments');
  });
});
