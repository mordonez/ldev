import fs from 'node:fs';
import path from 'node:path';

import fse from 'fs-extra';
import pWaitFor from 'p-wait-for';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../config/load-config.js';
import {runProcess} from '../platform/process.js';
import type {RuntimeAdapter, RuntimeStartOptions, RuntimeStopOptions} from './runtime-adapter.js';
import type {EnvLogsOptions, EnvLogsResult} from '../../features/env/env-logs.js';
import type {EnvStartResult} from '../../features/env/env-start.js';
import type {EnvStatusReport} from '../../features/env/env-health.js';
import type {EnvStopResult} from '../../features/env/env-stop.js';

type BladeWorkspaceRuntimeAdapterDependencies = {
  fileExists?: (filePath: string) => boolean;
  runProcess?: typeof runProcess;
  ensureDir?: typeof fse.ensureDir;
  copyFile?: typeof fse.copy;
  readDir?: typeof fse.readdir;
  removeFile?: typeof fse.remove;
};

export class BladeWorkspaceRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'blade-workspace';

  private readonly fileExists: (filePath: string) => boolean;
  private readonly runProcessFn: typeof runProcess;
  private readonly ensureDirFn: typeof fse.ensureDir;
  private readonly copyFileFn: typeof fse.copy;
  private readonly readDirFn: typeof fse.readdir;
  private readonly removeFileFn: typeof fse.remove;

  constructor(
    private readonly config: AppConfig,
    dependencies?: BladeWorkspaceRuntimeAdapterDependencies,
  ) {
    this.fileExists = dependencies?.fileExists ?? fs.existsSync;
    this.runProcessFn = dependencies?.runProcess ?? runProcess;
    this.ensureDirFn = dependencies?.ensureDir ?? fse.ensureDir;
    this.copyFileFn = dependencies?.copyFile ?? fse.copy;
    this.readDirFn = dependencies?.readDir ?? fse.readdir;
    this.removeFileFn = dependencies?.removeFile ?? fse.remove;
  }

  async start(options?: RuntimeStartOptions): Promise<EnvStartResult> {
    const repoRoot = requireRepoRoot(this.config);
    await ensureBladeAvailable(this.runProcessFn);

    if (!this.fileExists(path.join(repoRoot, 'bundles'))) {
      await runOrThrow(this.runProcessFn, 'blade', ['server', 'init'], repoRoot, 'WORKSPACE_INIT_FAILED', true);
    }

    const preparedActivationKey = await this.prepareActivationKey(repoRoot, options?.activationKeyFile);
    await runOrThrow(this.runProcessFn, 'blade', ['server', 'start'], repoRoot, 'WORKSPACE_START_FAILED', true);

    if (options?.wait ?? true) {
      await waitForWorkspacePortal(this.config.liferay.url, options?.timeoutSeconds ?? 250);
    }

    return {
      ok: true,
      dockerDir: repoRoot,
      portalUrl: this.config.liferay.url,
      waitedForHealth: options?.wait ?? true,
      activationKeyFile: preparedActivationKey,
    };
  }

  async stop(_options?: RuntimeStopOptions): Promise<EnvStopResult> {
    const repoRoot = requireRepoRoot(this.config);
    await ensureBladeAvailable(this.runProcessFn);
    await runOrThrow(this.runProcessFn, 'blade', ['server', 'stop'], repoRoot, 'WORKSPACE_STOP_FAILED', true);

    return {
      ok: true,
      dockerDir: repoRoot,
      stopped: true,
    };
  }

  async status(): Promise<EnvStatusReport> {
    const repoRoot = requireRepoRoot(this.config);
    const portalReachable = await isPortalReachable(this.config.liferay.url);
    const liferay = {
      service: 'liferay',
      state: portalReachable ? 'running' : null,
      health: null,
      containerId: null,
    };

    return {
      ok: true,
      repoRoot,
      dockerDir: repoRoot,
      dockerEnvFile: '',
      composeProjectName: 'blade-workspace',
      portalUrl: this.config.liferay.url,
      portalReachable,
      services: [liferay],
      liferay,
    };
  }

  async logs(options?: EnvLogsOptions): Promise<EnvLogsResult> {
    const repoRoot = requireRepoRoot(this.config);
    const catalinaOut = path.join(repoRoot, 'bundles', 'tomcat', 'logs', 'catalina.out');

    if (!this.fileExists(catalinaOut)) {
      throw new CliError(`Workspace log file was not found at ${catalinaOut}`, {
        code: 'WORKSPACE_LOG_FILE_NOT_FOUND',
      });
    }

    const args = ['-n', '200'];
    if (options?.follow ?? true) {
      args.push('-f');
    }
    args.push(catalinaOut);

    const result = await this.runProcessFn('tail', args, {
      cwd: repoRoot,
      stdout: 'inherit',
      stderr: 'inherit',
      reject: false,
    });

    if (!result.ok) {
      throw new CliError(result.stderr.trim() || result.stdout.trim() || `tail ${catalinaOut}`, {
        code: 'WORKSPACE_LOGS_FAILED',
      });
    }

    return {
      ok: true,
      service: options?.service ?? 'liferay',
      follow: options?.follow ?? true,
      since: options?.since ?? null,
    };
  }

  private async prepareActivationKey(repoRoot: string, activationKeyFile?: string): Promise<string | null> {
    const requestedFile = activationKeyFile?.trim() || process.env.LDEV_ACTIVATION_KEY_FILE?.trim();

    if (!requestedFile) {
      return null;
    }

    const sourceFile = path.resolve(requestedFile);
    if (!this.fileExists(sourceFile)) {
      throw new CliError(`The requested activation key does not exist: ${sourceFile}`, {
        code: 'WORKSPACE_ACTIVATION_KEY_NOT_FOUND',
      });
    }

    const fileName = path.basename(sourceFile);
    if (!/^activation-key-.*\.xml$/i.test(fileName)) {
      throw new CliError(`The activation key must be named activation-key-*.xml. Received: ${fileName}`, {
        code: 'WORKSPACE_ACTIVATION_KEY_INVALID_NAME',
      });
    }

    const workspaceDeployDir = path.join(repoRoot, 'configs', 'local', 'deploy');
    await this.ensureDirFn(workspaceDeployDir);
    await this.replaceActivationKeyInDir(workspaceDeployDir, fileName, sourceFile);

    const bundleDeployDir = path.join(repoRoot, 'bundles', 'deploy');
    if (this.fileExists(path.join(repoRoot, 'bundles'))) {
      await this.ensureDirFn(bundleDeployDir);
      await this.replaceActivationKeyInDir(bundleDeployDir, fileName, sourceFile);
    }

    return path.join(workspaceDeployDir, fileName);
  }

  private async replaceActivationKeyInDir(targetDir: string, fileName: string, sourceFile: string): Promise<void> {
    const existingEntries = await this.readDirFn(targetDir, {withFileTypes: true});
    await Promise.all(
      existingEntries
        .filter((entry) => entry.isFile() && /^activation-key-.*\.xml$/i.test(entry.name) && entry.name !== fileName)
        .map((entry) => this.removeFileFn(path.join(targetDir, entry.name))),
    );

    const destinationFile = path.join(targetDir, fileName);
    const sameFile = path.normalize(sourceFile) === path.normalize(destinationFile);
    if (!sameFile) {
      await this.copyFileFn(sourceFile, destinationFile, {overwrite: true});
    }
  }
}

async function ensureBladeAvailable(runProcessFn: typeof runProcess): Promise<void> {
  const result = await runProcessFn('blade', ['version'], {reject: false});

  if (!result.ok) {
    throw new CliError('blade is required for blade-workspace runtime commands.', {
      code: 'WORKSPACE_BLADE_REQUIRED',
    });
  }
}

async function runOrThrow(
  runProcessFn: typeof runProcess,
  command: string,
  args: string[],
  cwd: string,
  code: string,
  stream = false,
): Promise<void> {
  const result = await runProcessFn(command, args, {
    cwd,
    reject: false,
    ...(stream ? {stdout: 'inherit', stderr: 'inherit'} : {}),
  });

  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `${command} ${args.join(' ')} failed`, {code});
  }
}

function requireRepoRoot(config: AppConfig): string {
  if (!config.repoRoot) {
    throw new CliError('No workspace root was detected.', {code: 'WORKSPACE_ROOT_NOT_FOUND'});
  }

  return config.repoRoot;
}

async function waitForWorkspacePortal(url: string, timeoutSeconds: number): Promise<void> {
  let firstReachableAt: number | null = null;

  try {
    await pWaitFor(
      async () => {
        const reachable = await isPortalReachable(url);

        if (!reachable) {
          firstReachableAt = null;
          return false;
        }

        if (firstReachableAt === null) {
          firstReachableAt = Date.now();
          return false;
        }

        return Date.now() - firstReachableAt >= 5_000;
      },
      {
        timeout: timeoutSeconds * 1000,
        interval: 2_000,
      },
    );
  } catch {
    throw new CliError(`Timeout while waiting for a stable Workspace portal at ${url}.`, {
      code: 'WORKSPACE_START_TIMEOUT',
    });
  }
}

async function isPortalReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/c/portal/login`, {
      signal: AbortSignal.timeout(1000),
      redirect: 'manual',
    });

    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}
