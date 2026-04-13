import pc from 'picocolors';

import type {OutputFormat} from './formats.js';

export type Printer = {
  write: (value: unknown) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  format: OutputFormat;
};

export function createPrinter(format: OutputFormat): Printer {
  return {
    format,
    write(value) {
      if (format === 'text') {
        if (typeof value === 'string') {
          process.stdout.write(`${value}\n`);
          return;
        }
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        return;
      }

      if (format === 'ndjson') {
        process.stdout.write(`${JSON.stringify(value)}\n`);
        return;
      }

      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
    error(message) {
      process.stderr.write(`${format === 'text' ? pc.red(message) : message}\n`);
    },
    info(message) {
      process.stderr.write(`${format === 'text' ? pc.cyan(message) : message}\n`);
    },
  };
}

export async function withProgress<T>(printer: Printer, message: string, task: () => Promise<T>): Promise<T> {
  if (printer.format !== 'text') {
    return task();
  }

  const startedAt = Date.now();

  if (!process.stderr.isTTY) {
    printer.info(`${message}...`);
    const heartbeat = setInterval(() => {
      printer.info(`${message}: still running (${formatElapsed(Date.now() - startedAt)})`);
    }, 30_000);
    try {
      const result = await task();
      clearInterval(heartbeat);
      printer.info(`${message}: ok (${formatElapsed(Date.now() - startedAt)})`);
      return result;
    } catch (error) {
      clearInterval(heartbeat);
      printer.error(`${message}: error (${formatElapsed(Date.now() - startedAt)})`);
      throw error;
    }
  }

  const frames = ['-', '\\', '|', '/'];
  let index = 0;
  const render = () => {
    const elapsed = formatElapsed(Date.now() - startedAt);
    process.stderr.write(`\r${pc.cyan(frames[index % frames.length])} ${message} ${pc.dim(`(${elapsed})`)}`);
    index += 1;
  };

  render();
  const timer = setInterval(render, 120);

  try {
    const result = await task();
    clearInterval(timer);
    clearCurrentLine();
    printer.info(`${message}: ok (${formatElapsed(Date.now() - startedAt)})`);
    return result;
  } catch (error) {
    clearInterval(timer);
    clearCurrentLine();
    printer.error(`${message}: error (${formatElapsed(Date.now() - startedAt)})`);
    throw error;
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function clearCurrentLine(): void {
  process.stderr.write('\r');
  process.stderr.write(' '.repeat(process.stderr.columns || 80));
  process.stderr.write('\r');
}
