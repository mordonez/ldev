let input = '';

/**
 * @typedef {{filename: string}} NpmPackEntry
 */

/**
 * @param {unknown} value
 * @returns {value is NpmPackEntry}
 */
function isNpmPackEntry(value) {
  return typeof value === 'object' && value !== null && 'filename' in value && typeof value.filename === 'string';
}

/**
 * @param {string} json
 * @returns {string}
 */
function extractFilename(json) {
  /** @type {unknown} */
  const parsedValue = JSON.parse(json);
  if (!Array.isArray(parsedValue)) {
    throw new Error('npm pack JSON output must be an array.');
  }

  /** @type {unknown[]} */
  const parsedEntries = parsedValue;
  const lastEntry = parsedEntries.at(-1);
  if (!isNpmPackEntry(lastEntry)) {
    throw new Error('Could not resolve package filename from npm pack JSON output.');
  }

  return lastEntry.filename;
}

process.stdin.setEncoding('utf8');
/** @param {string} chunk */
process.stdin.on('data', (chunk) => {
  input += String(chunk);
});

process.stdin.on('end', () => {
  const packJson = input.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)?.[0];

  if (!packJson) {
    console.error('Could not find npm pack JSON output in stdout.');
    process.exit(1);
  }

  try {
    const filename = extractFilename(packJson);
    process.stdout.write(`${filename}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
