import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatVerifyPage} from '../../features/verify/verify-page-format.js';
import {resolveVerifyLoginCredentials} from '../../features/verify/verify-login-credentials.js';
import {runVerifyPage} from '../../features/verify/verify-page.js';

type VerifyPageCommandOptions = {
  url: string;
  screenshot?: string;
  skipLogin?: boolean;
  loginEmail?: string;
  loginPassword?: string;
};

export function createVerifyCommand(): Command {
  const command = new Command('verify').description(
    'Run browser-driven visual verification against a running Liferay portal',
  );

  addOutputFormatOption(
    command
      .command('page')
      .description('Log in, navigate to a page, and report console errors, a screenshot, and DOM sanity checks')
      .requiredOption('--url <friendlyUrl>', 'Friendly URL to verify, e.g. /web/guest/home, or a full http(s) URL')
      .option('--screenshot <path>', 'Screenshot output path (default: .tmp/verify/<slug>-<timestamp>.png)')
      .option('--skip-login', 'Skip the login step (use for public pages)')
      .option('--login-email <email>', 'Login email (default: LDEV_VERIFY_LOGIN_EMAIL or test@liferay.com)')
      .option('--login-password <password>', 'Login password (default: LDEV_VERIFY_LOGIN_PASSWORD or test)')
      .addHelpText(
        'after',
        `
Runs the full post-change visual verification sequence in one call: login, navigation,
console error capture, screenshot, DOM sanity checks, and (when the project has a local
resource catalog) a diff of the rendered page's structures/templates/adts/fragments
against the files tracked under liferay/resources.

Requires 'playwright' to be installed as a local dependency:
  npm install --save-dev playwright && npx playwright install chromium

Examples:
  ldev verify page --url /web/guest/home
  ldev verify page --url /web/guest/home --skip-login --json
  ldev verify page --url /web/guest/home --screenshot .tmp/verify/home.png
`,
      ),
    'text',
  ).action(
    createFormattedAction(
      async (context, options: VerifyPageCommandOptions) => {
        const credentials = resolveVerifyLoginCredentials({
          email: options.loginEmail,
          password: options.loginPassword,
        });

        return runVerifyPage(context.project, {
          url: options.url,
          credentials,
          screenshotPath: options.screenshot,
          skipLogin: options.skipLogin,
        });
      },
      {
        text: formatVerifyPage,
        exitCode: (result) => (result.ok ? 0 : 1),
      },
    ),
  );

  return command;
}
