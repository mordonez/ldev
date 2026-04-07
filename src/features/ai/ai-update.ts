import type {Printer} from '../../core/output/printer.js';

import {formatAiResult, runAiInstall, type AiCommandResult} from './ai-install.js';

export async function runAiUpdate(
  options: {targetDir: string; selectedSkills?: string[]; printer: Printer},
  dependencies?: Parameters<typeof runAiInstall>[1],
): Promise<AiCommandResult> {
  return runAiInstall(
    {
      targetDir: options.targetDir,
      force: false,
      skillsOnly: true,
      selectedSkills: options.selectedSkills,
      printer: options.printer,
    },
    dependencies,
  );
}

export {formatAiResult, type AiCommandResult};
