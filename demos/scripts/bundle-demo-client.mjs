import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await esbuild.build({
  entryPoints: [join(root, 'shared/demo-client.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: join(root, 'shared/causet-demo-client.mjs'),
  sourcemap: true,
  target: ['es2022'],
});

console.log('Bundled demos/shared/causet-demo-client.mjs');
