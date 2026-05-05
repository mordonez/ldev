import {resolve} from 'node:path';

import {defineConfig} from 'vite';

const dashboardClientRoot = resolve(import.meta.dirname, 'src/features/dashboard/client');

export default defineConfig({
  root: dashboardClientRoot,
  build: {
    outDir: resolve(import.meta.dirname, 'dist/dashboard-client'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(dashboardClientRoot, 'index.html'),
    },
  },
});
