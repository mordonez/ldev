import {exec} from 'node:child_process';

import {Command} from 'commander';

import {createDashboardServer} from '../../features/dashboard/dashboard-server.js';

export function createDashboardCommand(): Command {
  return new Command('dashboard')
    .description('Start a local web dashboard to monitor and control worktrees and environments')
    .option('--port <number>', 'Port to listen on', '4242')
    .option('--no-open', 'Do not open the browser automatically')
    .action(async (options: {port: string; open: boolean}) => {
      const cwd = process.cwd();
      const port = parseInt(options.port, 10);

      createDashboardServer({
        cwd,
        port,
        onReady: (url) => {
          console.log(`ldev dashboard running at ${url}`);
          console.log('Press Ctrl+C to stop.');
          if (options.open !== false) {
            const openCmd =
              process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
            exec(`${openCmd} ${url}`);
          }
        },
      });

      await new Promise<never>(() => {});
    });
}
