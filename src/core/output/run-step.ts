import {withProgress, type Printer} from './printer.js';

/**
 * Run a labeled task with optional progress output.
 * When printer is undefined the task runs silently.
 */
export function runStep<T>(printer: Printer | undefined, label: string, run: () => Promise<T>): Promise<T> {
  return printer ? withProgress(printer, label, run) : run();
}
