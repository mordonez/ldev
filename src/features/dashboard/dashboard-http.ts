import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

function isMissingResourceError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('not found');
}

export function writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(payload));
}

export function writeDashboardError(
  res: http.ServerResponse,
  err: unknown,
  options?: {badRequestMessage?: string; internalMessage?: string; notFoundMessage?: string},
): void {
  const status = err instanceof SyntaxError ? 400 : isMissingResourceError(err) ? 404 : 500;
  const errorMessage =
    status === 400
      ? (options?.badRequestMessage ?? 'Invalid request payload')
      : status === 404
        ? (options?.notFoundMessage ?? 'Requested resource was not found')
        : (options?.internalMessage ?? 'Internal dashboard error');

  writeJson(res, status, {error: errorMessage});
}

export async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    throw new Error('Unsupported request body chunk type');
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.map' || ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

export function readDashboardIndex(clientDistDirs: string[]): string | null {
  for (const distDir of clientDistDirs) {
    const distIndexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexPath)) {
      return fs.readFileSync(distIndexPath, 'utf8');
    }
  }

  return null;
}

export function resolveDashboardAsset(urlPath: string, clientDistDirs: string[]): string | null {
  for (const distDir of clientDistDirs) {
    const distAssetPath = path.resolve(distDir, urlPath.replace(/^\/+/, ''));
    if (distAssetPath.startsWith(distDir + path.sep) && fs.existsSync(distAssetPath)) {
      return distAssetPath;
    }
  }

  return null;
}

export function serveDashboardClientIndex(res: http.ServerResponse, clientDistDirs: string[]): boolean {
  const dashboardIndex = readDashboardIndex(clientDistDirs);
  if (!dashboardIndex) {
    res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Dashboard client bundle not found. Run npm run build:dashboard before starting the dashboard.');
    return true;
  }

  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(dashboardIndex);
  return true;
}

export function serveDashboardClientAsset(
  res: http.ServerResponse,
  urlPath: string,
  clientDistDirs: string[],
): boolean {
  const assetPath = resolveDashboardAsset(urlPath, clientDistDirs);
  if (!assetPath) return false;

  res.writeHead(200, {'Content-Type': getContentType(assetPath)});
  fs.createReadStream(assetPath).pipe(res);
  return true;
}
