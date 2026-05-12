import {CliError} from '../../../core/errors.js';

export type WhereUsedCandidateLike = {
  fullUrl: string;
  origin?: 'layout' | 'headlessStructuredContent' | 'jsonwsJournal';
};

export function extractErrorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isSkippableWhereUsedCandidateError(candidate: WhereUsedCandidateLike, error: unknown): boolean {
  if (candidate.origin !== 'jsonwsJournal') {
    return false;
  }

  const message = extractErrorMessage(error);
  return message.includes('No structured content found with friendlyUrlPath=');
}
