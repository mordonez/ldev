import {buildAuthOptions, expectJsonSuccess} from '../liferay-http-shared.js';

export {buildAuthOptions as authOptions, expectJsonSuccess};

export function normalizeMigrationPhase(phase?: string): '' | 'pre' | 'post' | 'both' {
  const normalized = (phase ?? '').trim().toLowerCase();
  if (normalized === 'pre' || normalized === 'post' || normalized === 'both') {
    return normalized;
  }
  return '';
}

export function shouldRunPostMigration(phase: '' | 'pre' | 'post' | 'both'): boolean {
  return phase === '' || phase === 'post' || phase === 'both';
}
