import {describe, expect, test} from 'vitest';

import {parseLines} from '../../src/core/utils/text.js';

describe('parseLines', () => {
  test('splits text into lines and trims whitespace', () => {
    const result = parseLines('line1\nline2\n  line3  ');
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  test('handles CRLF line endings', () => {
    const result = parseLines('line1\r\nline2\r\nline3');
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  test('removes empty lines', () => {
    const result = parseLines('line1\n\nline2\n   \nline3');
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  test('ignores comment lines when ignoreComments is true', () => {
    const result = parseLines('line1\n# comment\nline2\n#another\nline3', {ignoreComments: true});
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  test('includes comment lines when ignoreComments is false', () => {
    const result = parseLines('line1\n# comment\nline2', {ignoreComments: false});
    expect(result).toEqual(['line1', '# comment', 'line2']);
  });

  test('includes comment lines by default', () => {
    const result = parseLines('line1\n# comment\nline2');
    expect(result).toEqual(['line1', '# comment', 'line2']);
  });

  test('handles empty input', () => {
    const result = parseLines('');
    expect(result).toEqual([]);
  });

  test('handles only whitespace', () => {
    const result = parseLines('   \n  \n   ');
    expect(result).toEqual([]);
  });
});
