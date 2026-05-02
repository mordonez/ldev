import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {tmpdir} from 'node:os';

function getCommand(command) {
  if (process.platform === 'win32') {
    return process.env.ComSpec ?? 'cmd.exe';
  }

  return command;
}

function getArgs(command, args) {
  if (process.platform !== 'win32') {
    return args;
  }

  return ['/d', '/s', '/c', command, ...args];
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} [options]
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(getCommand(command), getArgs(command, args), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      process.stdout.write(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({stdout, stderr});
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

function parsePackFilename(stdout) {
  const packJson = stdout.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)?.[0];

  if (!packJson) {
    throw new Error(`Could not parse npm pack JSON output:\n${stdout}`);
  }

  const [{filename}] = JSON.parse(packJson);
  return filename;
}

function getInstalledCliPath(prefixDir) {
  if (process.platform === 'win32') {
    return path.join(prefixDir, 'ldev.cmd');
  }

  return path.join(prefixDir, 'bin', 'ldev');
}

async function run() {
  await rm(path.join(process.cwd(), 'mordonezdev-ldev-*.tgz'), {force: true, recursive: false}).catch(() => {});
  await runCommand('npm', ['run', 'build']);

  const packResult = await runCommand('npm', ['pack', '--json', '--ignore-scripts']);
  const packageFile = parsePackFilename(packResult.stdout);
  const packagePath = path.join(process.cwd(), packageFile);
  const installPrefix = await mkdtemp(path.join(tmpdir(), 'ldev-pack-'));
  const installedCli = getInstalledCliPath(installPrefix);

  try {
    await runCommand('npm', ['install', '-g', '--prefix', installPrefix, packagePath]);
    await runCommand(installedCli, ['--help']);
    await runCommand(installedCli, ['--version']);
  } finally {
    await rm(installPrefix, {recursive: true, force: true});
    await rm(packagePath, {force: true});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});