import {describe, expect, test} from 'vitest';

import {formatOsgiDiag} from '../../src/features/osgi/osgi-diag.js';
import {formatOsgiHeapDump} from '../../src/features/osgi/osgi-heap-dump.js';
import {formatOsgiStatus} from '../../src/features/osgi/osgi-status.js';
import {formatOsgiThreadDump} from '../../src/features/osgi/osgi-thread-dump.js';

describe('formatOsgiStatus', () => {
  test('returns the raw gogo output', () => {
    const output = '42|Active   |    1|com.test.bundle (1.0.0)';
    const result = formatOsgiStatus({ok: true, bundle: 'com.test.bundle', output});

    expect(result).toBe(output);
  });
});

describe('formatOsgiDiag', () => {
  test('returns the raw diag output', () => {
    const output = 'No unresolved constraints';
    const result = formatOsgiDiag({ok: true, bundle: 'com.test.bundle', bundleId: '42', output});

    expect(result).toBe(output);
  });
});

describe('formatOsgiThreadDump', () => {
  test('includes the output directory in the message', () => {
    const result = formatOsgiThreadDump({ok: true, count: 6, intervalSeconds: 3, outputDir: './dumps'});

    expect(result).toContain('./dumps');
  });
});

describe('formatOsgiHeapDump', () => {
  test('includes the output directory in the message', () => {
    const result = formatOsgiHeapDump({ok: true, outputDir: './dumps'});

    expect(result).toContain('./dumps');
  });
});
