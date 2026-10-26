#!/usr/bin/env node
// Bundles the dev harness + one diagram module into dev/build/<id>.js (classic IIFE, runs from file://).
// Usage: node scripts/build-diagram.mjs <id> [<id> ...]   |   node scripts/build-diagram.mjs --all
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ids = process.argv.slice(2);
if (ids.includes('--all')) {
  ids = fs.readdirSync(path.join(root, 'src/diagrams')).filter(f => /^s\d\d-.*\.js$/.test(f)).map(f => f.replace(/\.js$/, ''));
}
if (!ids.length) { console.error('usage: node scripts/build-diagram.mjs <id> [...] | --all'); process.exit(2); }
fs.mkdirSync(path.join(root, 'dev/build'), { recursive: true });
let failed = 0;
for (const id of ids) {
  // real diagrams live in src/diagrams; dev-only test modules (s00-*) live in dev/
  let rel = `../src/diagrams/${id}.js`;
  if (!fs.existsSync(path.join(root, 'src/diagrams', id + '.js'))) rel = `./${id}.js`;
  const file = path.join(root, 'dev', rel);
  if (!fs.existsSync(file)) { console.error(`✗ ${id}: not found in src/diagrams or dev`); failed++; continue; }
  try {
    await esbuild.build({
      stdin: {
        contents: `import d from '${rel}';\nimport { run } from './harness.js';\nrun(d).catch(e => { document.title = 'error'; document.body.insertAdjacentHTML('beforeend', '<pre id="err" style="color:#CD2E3A;font:14px monospace;position:absolute;left:10px;top:10px;z-index:9">' + (e && e.stack || e) + '</pre>'); console.error(e); });\n`,
        resolveDir: path.join(root, 'dev'),
        sourcefile: `entry-${id}.js`,
        loader: 'js',
      },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      outfile: path.join(root, 'dev/build', id + '.js'),
      loader: { '.json': 'json' },
      logLevel: 'error',
      legalComments: 'none',
      sourcemap: false,
    });
    console.log(`✓ ${id}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${id}`);
  }
}
process.exit(failed ? 1 : 0);
