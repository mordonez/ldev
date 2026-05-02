import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {tmpdir} from 'node:os';
import {execa} from 'execa';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('execa').Options} [options]
 */
async function runCommand(command, args, options = {}) {
  const result = await execa(command, args, {
    cwd: process.cwd(),
    env: process.env,
    reject: false,
    ...options,
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.exitCode ?? 'unknown'}`);
  }

  return result;
}

function parsePackFilename(stdout) {
  const packJson = stdout.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)?.[0];

  if (!packJson) {
    throw new Error(`Could not parse npm pack JSON output:\n${stdout}`);
  }

  const [{filename}] = JSON.parse(packJson);
  return filename;
}

function getInstalledCliEntry(prefixDir) {
  return path.join(prefixDir, 'node_modules', '@mordonezdev', 'ldev', 'dist', 'index.js');
}

async function run() {
  await runCommand('npm', ['run', 'build']);

  const packDir = await mkdtemp(path.join(tmpdir(), 'ldev-pack-tgz-'));
  const packResult = await runCommand('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir]);
  const packageFile = parsePackFilename(packResult.stdout);
  const packagePath = path.join(packDir, packageFile);
  const installPrefix = await mkdtemp(path.join(tmpdir(), 'ldev-pack-'));
  const installedCliEntry = getInstalledCliEntry(installPrefix);

  try {
    await runCommand('npm', ['install', '-g', '--prefix', installPrefix, packagePath]);
    await runCommand('node', [installedCliEntry, '--help']);
    await runCommand('node', [installedCliEntry, '--version']);
  } finally {
    await rm(installPrefix, {recursive: true, force: true});
    await rm(packDir, {recursive: true, force: true});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});