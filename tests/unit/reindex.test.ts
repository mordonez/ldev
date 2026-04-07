import {describe, expect, test} from 'vitest';

import {formatReindexSpeedup} from '../../src/features/reindex/reindex-speedup.js';
import {formatReindexStatus} from '../../src/features/reindex/reindex-status.js';
import {formatReindexTasks} from '../../src/features/reindex/reindex-tasks.js';
import {
  formatReindexWatch,
  formatReindexWatchSnapshot,
  shouldStreamReindexWatch,
} from '../../src/features/reindex/reindex-watch.js';

describe('formatReindexStatus', () => {
  test('returns rows formatted as space-separated fields', () => {
    const result = formatReindexStatus({
      ok: true,
      esUrl: 'http://localhost:9200',
      rows: [
        {health: 'green', status: 'open', index: 'liferay-20097', docsCount: '100'},
        {health: 'yellow', status: 'open', index: 'journal-article', docsCount: '25'},
      ],
    });

    expect(result).toBe('green open liferay-20097 100\nyellow open journal-article 25');
  });

  test('returns empty-index message when no rows', () => {
    const result = formatReindexStatus({
      ok: true,
      esUrl: 'http://localhost:9200',
      rows: [],
    });

    expect(result).toContain('http://localhost:9200');
  });
});

describe('formatReindexSpeedup', () => {
  test('returns speedup ON message when enabled', () => {
    const result = formatReindexSpeedup({ok: true, enabled: true});

    expect(result).toContain('ON');
    expect(result).toContain('-1');
  });

  test('returns speedup OFF message when disabled', () => {
    const result = formatReindexSpeedup({ok: true, enabled: false});

    expect(result).toContain('OFF');
    expect(result).toContain('1s');
  });
});

describe('formatReindexTasks', () => {
  test('returns raw output when present', () => {
    const result = formatReindexTasks({ok: true, output: 'backgroundtaskid | 123\nstatus | RUNNING'});

    expect(result).toContain('RUNNING');
  });

  test('returns empty-tasks message when output is empty string', () => {
    const result = formatReindexTasks({ok: true, output: ''});

    expect(result).toContain('Sin tareas');
  });
});

describe('formatReindexWatchSnapshot', () => {
  test('prefixes output with [index+1/iterations]', () => {
    const snapshot = {
      ok: true as const,
      esUrl: 'http://localhost:9200',
      rows: [{health: 'green', status: 'open', index: 'liferay-20097', docsCount: '50'}],
    };

    const result = formatReindexWatchSnapshot(snapshot, {index: 0, iterations: 3});

    expect(result).toMatch(/^\[1\/3\]/);
    expect(result).toContain('green open liferay-20097 50');
  });

  test('shows empty-index message inside snapshot when no rows', () => {
    const snapshot = {
      ok: true as const,
      esUrl: 'http://es:9200',
      rows: [],
    };

    const result = formatReindexWatchSnapshot(snapshot, {index: 1, iterations: 5});

    expect(result).toMatch(/^\[2\/5\]/);
    expect(result).toContain('http://es:9200');
  });
});

describe('formatReindexWatch', () => {
  test('joins all snapshot lines separated by newline', () => {
    const snapshot = {
      ok: true as const,
      esUrl: 'http://localhost:9200',
      rows: [{health: 'green', status: 'open', index: 'liferay-20097', docsCount: '10'}],
    };

    const result = formatReindexWatch({
      ok: true,
      intervalSeconds: 5,
      iterations: 2,
      snapshots: [snapshot, snapshot],
    });

    expect(result).toContain('[1/2]');
    expect(result).toContain('[2/2]');
  });
});

describe('shouldStreamReindexWatch', () => {
  test('returns true for text format', () => {
    expect(shouldStreamReindexWatch('text')).toBe(true);
  });

  test('returns true for ndjson format', () => {
    expect(shouldStreamReindexWatch('ndjson')).toBe(true);
  });

  test('returns false for json format', () => {
    expect(shouldStreamReindexWatch('json')).toBe(false);
  });
});
