import {describe, expect, test} from 'vitest';

import {parseLogDiagnosis} from '../../src/features/env/env-logs-diagnose.js';

describe('env-logs-diagnose', () => {
  test('groups repeated exceptions and counts warnings', () => {
    const result = parseLogDiagnosis(
      [
        '2026-03-28T10:00:00Z WARN [http-nio-8080-exec-1] something noisy',
        '2026-03-28T10:00:01Z com.liferay.portal.kernel.exception.PortalException: Missing article',
        '\tat com.foo.Bar.test(Bar.java:10)',
        '2026-03-28T10:00:02Z Caused by: java.lang.NullPointerException: broken',
        '\tat com.foo.Baz.test(Baz.java:20)',
        '2026-03-28T10:00:03Z com.liferay.portal.kernel.exception.PortalException: Missing article',
        '\tat com.foo.Bar.test(Bar.java:10)',
      ].join('\n'),
      {service: 'liferay', since: '10m'},
    );

    expect(result.warnings).toBe(1);
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions[0]).toMatchObject({
      class: 'com.liferay.portal.kernel.exception.PortalException',
      count: 2,
      firstSeen: '2026-03-28T10:00:01Z',
    });
    expect(result.exceptions[0].suggestedCauses.join(' ')).toContain('permissions');
    expect(result.exceptions[1].class).toBe('java.lang.NullPointerException');
  });
});
