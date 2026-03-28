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

  if (!process.stderr.isTTY) {
    printer.info(`${message}...`);
    try {
      const result = await task();
      printer.info(`${message}: ok`);
      return result;
    } catch (error) {
      printer.error(`${message}: error`);
      throw error;
    }
  }

  const frames = ['-', '\\', '|', '/'];
  let index = 0;
  const render = () => {
    process.stderr.write(`\r${pc.cyan(frames[index % frames.length])} ${message}`);
    index += 1;
  };

  render();
  const timer = setInterval(render, 120);

  try {
    const result = await task();
    clearInterval(timer);
    clearCurrentLine();
    printer.info(`${message}: ok`);
    return result;
  } catch (error) {
    clearInterval(timer);
    clearCurrentLine();
    printer.error(`${message}: error`);
    throw error;
  }
}

function clearCurrentLine(): void {
  process.stderr.write('\r');
  process.stderr.write(' '.repeat(process.stderr.columns || 80));
  process.stderr.write('\r');
}
