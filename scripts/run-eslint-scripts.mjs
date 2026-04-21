import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {LINT_SCRIPT_FILES} from './eslint-script-files.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const eslintBin = path.resolve(scriptDir, '..', 'node_modules', 'eslint', 'bin', 'eslint.js');
const extraArgs = process.argv.slice(2);
const result = spawnSync(process.execPath, [eslintBin, ...LINT_SCRIPT_FILES, ...extraArgs], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);