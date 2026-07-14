/**
 * Bundle @causet/sdk into a single browser ESM file for the demo UI.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outfile = path.join(root, 'public/vendor/causet-sdk.js');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'scripts/sdk-entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile,
  sourcemap: true,
  logLevel: 'info',
});

console.log(`Bundled @causet/sdk → ${path.relative(root, outfile)}`);
