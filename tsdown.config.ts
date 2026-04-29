import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp-server.ts'],
  format: ['esm'],
  platform: 'node',
  clean: true,
  sourcemap: true,
  dts: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
});
