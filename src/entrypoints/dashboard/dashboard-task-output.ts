import type {Printer} from '../../core/output/printer.js';

export function writeTaskLines(printer: Printer, output: string): void {
  for (const line of output.split('\n')) {
    if (line.trim()) {
      printer.info(line);
    }
  }
}
