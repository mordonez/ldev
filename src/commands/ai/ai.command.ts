import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatAiResult, runAiInstall} from '../../features/ai/ai-install.js';
import {formatAiStatus, runAiStatus} from '../../features/ai/ai-status.js';
import {runAiUpdate} from '../../features/ai/ai-update.js';

function collectSkillOption(value: string, previous: string[]): string[] {
  const skill = value.trim();
  if (skill.length === 0) {
    return previous;
  }
  return [...previous, skill];
}

export function createAiCommand(): Command {
  const command = new Command('ai');
  const installCommand = addOutputFormatOption(
    command
      .command('install')
      .description('Install the standard reusable AI assets into a project')
      .requiredOption('--target <target>', 'Project root')
      .option(
        '--force',
        'Overwrite AGENTS.md and requested project AI files if they already exist; project-context requires explicit --project-context',
      )
      .option(
        '--local',
        'Keep AI tooling local by adding generated agent/editor files to .gitignore while leaving docs/ai versionable',
      )
      .option('--skills-only', 'Only update vendor skills from the manifest')
      .option(
        '--project-context',
        'Also install project-owned context scaffolding (docs/ai/project-context.md and sample)',
      )
      .option(
        '--skill <name>',
        'Install only specific vendor skills (repeat for multiple skills)',
        collectSkillOption,
        [],
      )
      .option(
        '--project',
        'Also install project-owned skills and agents; filtered by project type/capabilities and not managed by ai update',
      ),
  );
  const updateCommand = addOutputFormatOption(
    command
      .command('update')
      .description('Safely update vendor skills listed in the manifest')
      .requiredOption('--target <target>', 'Project root')
      .option(
        '--skill <name>',
        'Update only specific vendor skills and rewrite the vendor manifest to that set',
        collectSkillOption,
        [],
      ),
  );
  const statusCommand = addOutputFormatOption(
    command
      .command('status')
      .description('Inspect managed AI rules, manifest state and drift')
      .requiredOption('--target <target>', 'Project root'),
    'json',
  );

  command.description('Standard reusable AI assets and skills for ldev projects').addHelpText(
    'after',
    `
This namespace bootstraps the reusable AI surface for a project that uses ldev.

Safe defaults:
  update               Refresh vendor-managed skills listed in the manifest
  status               Inspect managed rule ownership, manifest state and drift

Potentially mutating:
  install              Install vendor skills + AGENTS.md bootstrap
  install --skill ...  Install only selected vendor skills (like tsdown --skill patterns)
  install --force      Overwrite AGENTS.md and requested project AI files when bootstrapping a project
                       project-context files are only overwritten when --project-context is explicitly passed
  install --local      Add generated agent/editor files to .gitignore, but keep docs/ai versionable
  install --project-context
                      Also install project-owned context scaffolding.
  install --project    Also install project-owned skills and agents.
                       ldev only installs the subset that makes sense for the detected project type/runtime:
                       update will not touch them once installed. Also installs project context scaffolding.
  update --skill ...   Re-scope the vendor-managed set to specific skills and refresh them
`,
  );

  installCommand.action(
    createFormattedAction(
      async (context, options) => {
        const result = await runAiInstall({
          targetDir: options.target,
          force: Boolean(options.force),
          local: Boolean(options.local),
          skillsOnly: Boolean(options.skillsOnly),
          project: Boolean(options.project),
          projectContext: Boolean(options.projectContext),
          selectedSkills: options.skill as string[],
          printer: context.printer,
        });
        return result;
      },
      {text: formatAiResult},
    ),
  );

  updateCommand.action(
    createFormattedAction(
      async (context, options) => {
        const result = await runAiUpdate({
          targetDir: options.target,
          selectedSkills: options.skill as string[],
          printer: context.printer,
        });
        return result;
      },
      {text: formatAiResult},
    ),
  );

  statusCommand.action(
    createFormattedAction(async (_context, options) => runAiStatus(options.target as string), {
      text: formatAiStatus,
    }),
  );

  return command;
}
