/**
 * Split text into non-empty trimmed lines, optionally ignoring comment lines.
 */
export function parseLines(text: string, options?: {ignoreComments?: boolean}): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line === '') return false;
      if (options?.ignoreComments && line.startsWith('#')) return false;
      return true;
    });
}
