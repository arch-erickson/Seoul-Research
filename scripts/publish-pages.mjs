#!/usr/bin/env node
// Publish the built deck to GitHub Pages: arch-erickson/Seoul-Research, served from docs/ on main.
// Live at https://arch-erickson.github.io/Seoul-Research/
//
// Usage:  node scripts/publish-pages.mjs [--no-build] [--message "what changed"] [--dry]
//   --no-build   publish dist/ as it is (skip node scripts/build.mjs)
//   --dry        run every check and stage the copy, but do not commit or push
//
// Checks before anything is pushed:
//   1. every relative reference in dist/*.html (attributes, CSS url(), and asset paths inside the inline script)
//      points at a file that exists with the EXACT same letter case (GitHub Pages is case-sensitive; Windows is not),
//   2. no single file is too large for GitHub (> 95 MB), and the site stays well under the Pages limit.
// After pushing it waits for the Pages build and fetches the key URLs to confirm they return 200.

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WS, 'dist');
const SITE = process.env.SITE_REPO || 'C:/Users/erick/AppData/Local/Temp/claude/seoul-research-site';
const REPO = 'arch-erickson/Seoul-Research';
const LIVE = 'https://arch-erickson.github.io/Seoul-Research/';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = flag('--dry');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const fail = (msg) => { console.error('\nPUBLISH STOPPED: ' + msg); process.exit(1); };
const git = (...args) => execFileSync('git', args, { cwd: SITE, encoding: 'utf8' }).trim();

// ---------- 0. site repo ----------
if (!fs.existsSync(path.join(SITE, '.git'))) {
  console.log('Cloning ' + REPO + ' into ' + SITE);
  execFileSync('gh', ['repo', 'clone', REPO, SITE], { stdio: 'inherit' });
}

// ---------- 1. build ----------
if (!flag('--no-build')) {
  console.log('Building the deck...');
  const b = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: WS, stdio: 'inherit' });
  if (b.status !== 0) fail('node scripts/build.mjs failed');
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html does not exist; build the deck first');

// ---------- 2. checks ----------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function existsExact(abs) {
  const rel = path.relative(DIST, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  let cur = DIST;
  for (const part of rel.split(path.sep)) {
    if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) return false;
    if (!fs.readdirSync(cur).includes(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
}
const files = walk(DIST);
const problems = [];
const isExternal = (u) => /^(https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(u);
// Photos the user is still supplying (status "user-supply" in spec/images.json) are expected to be missing:
// the deck shows a neutral panel for them. Their references are allowed; every other missing file still fails.
const expectedMissing = new Set();
try {
  const imgs = JSON.parse(fs.readFileSync(path.join(WS, 'spec', 'images.json'), 'utf8'));
  for (const p of imgs.pairs || []) for (const side of ['seoul', 'nyc']) {
    const x = p[side];
    if (x && x.status === 'user-supply' && x.file && !fs.existsSync(path.join(DIST, x.file))) expectedMissing.add(x.file.replace(/^\.\//, ''));
  }
} catch { /* no image list yet */ }
if (expectedMissing.size) console.log(expectedMissing.size + ' photo(s) still to be supplied by the user (allowed to be missing).');
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (!['.html', '.css', '.js'].includes(ext)) continue;
  const text = fs.readFileSync(f, 'utf8');
  const refs = new Set();
  // HTML: markup attributes, CSS in <style>, and asset paths inside the inline <script> blocks are scanned separately,
  // so code in the minified bundle is never mistaken for an attribute or a url().
  const scripts = ext === '.js' ? text : ext === '.html' ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n') : '';
  const styles = ext === '.css' ? text : ext === '.html' ? [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') : '';
  const markup = ext === '.html' ? text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '') : '';
  for (const m of markup.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1]);
  for (const m of (styles + '\n' + markup).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.add(m[1]);
  for (const m of scripts.matchAll(/["'`]((?:\.\/)?assets\/[^"'`\s]+?\.(?:jpe?g|png|webp|gif|avif|svg|woff2?|json|mp4))["'`]/gi)) refs.add(m[1]);
  for (let r of refs) {
    r = r.trim();
    if (!r || isExternal(r)) continue;
    const clean = decodeURI(r.split('#')[0].split('?')[0]);
    if (!clean) continue;
    if (clean.startsWith('/')) { problems.push(path.relative(DIST, f) + ': absolute path "' + r + '" breaks under /Seoul-Research/; use a relative path'); continue; }
    const base = ext === '.js' ? DIST : path.dirname(f); // asset paths resolve against the page, which sits at the dist root
    if (expectedMissing.has(clean.replace(/^\.\//, ''))) continue;
    if (!existsExact(path.resolve(base, clean))) problems.push(path.relative(DIST, f) + ': "' + r + '" not found with this exact letter case');
  }
}
let total = 0;
for (const f of files) {
  const s = fs.statSync(f).size; total += s;
  if (s > 95 * 1024 * 1024) problems.push(path.relative(DIST, f) + ' is ' + (s / 1048576).toFixed(1) + ' MB (GitHub rejects files over 100 MB)');
}
if (total > 900 * 1024 * 1024) problems.push('site is ' + (total / 1048576).toFixed(0) + ' MB (GitHub Pages limit is 1 GB)');
console.log('Checked ' + files.length + ' files, ' + (total / 1048576).toFixed(1) + ' MB.');
if (problems.length) fail('\n  - ' + problems.join('\n  - '));

// ---------- 3. mirror dist -> docs, refresh source snapshot ----------
const DOCS = path.join(SITE, 'docs');
fs.rmSync(DOCS, { recursive: true, force: true });
fs.cpSync(DIST, DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

const SKIP = (src) => {
  const rel = path.relative(WS, src).split(path.sep).join('/');
  return rel.includes('node_modules') || rel.startsWith('.tmp') || /(^|\/)s00-[^/]*$/.test(rel) || /\.log$/.test(rel);
};
for (const d of ['src', 'scripts', 'spec']) {
  fs.rmSync(path.join(SITE, d), { recursive: true, force: true });
  if (fs.existsSync(path.join(WS, d))) fs.cpSync(path.join(WS, d), path.join(SITE, d), { recursive: true, filter: (s) => !SKIP(s) });
}
for (const f of ['package.json', 'ARCHITECTURE.md']) {
  if (fs.existsSync(path.join(WS, f))) fs.copyFileSync(path.join(WS, f), path.join(SITE, f));
}
const GA = path.join(SITE, '.gitattributes');
if (!fs.existsSync(GA)) fs.writeFileSync(GA, '* text=auto\n*.jpg binary\n*.jpeg binary\n*.png binary\n*.webp binary\n*.woff2 binary\n*.pdf binary\n');

// ---------- 4. commit + push ----------
git('add', '-A');
const staged = git('status', '--porcelain');
if (!staged) { console.log('No changes to publish. Live site: ' + LIVE); process.exit(0); }
if (DRY) { console.log('Dry run: staged ' + staged.split('\n').length + ' changes in ' + SITE + ', not committed.'); process.exit(0); }
const msg = (opt('--message') || 'Publish presentation build') + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n';
execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: SITE, input: msg });
const sha = git('rev-parse', 'HEAD');
execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: SITE, stdio: 'inherit' });
console.log('Pushed ' + sha.slice(0, 7) + '. Waiting for GitHub Pages to build...');

// ---------- 5. wait for the Pages build, then check the live URLs ----------
let status = 'unknown';
for (let i = 0; i < 40; i++) {
  sleep(6000);
  const r = spawnSync('gh', ['api', 'repos/' + REPO + '/pages/builds/latest', '--jq', '.status + " " + .commit'], { encoding: 'utf8' });
  const [st, commit] = (r.stdout || '').trim().split(' ');
  if (commit === sha && (st === 'built' || st === 'errored')) { status = st; break; }
}
if (status !== 'built') fail('Pages build status: ' + status + ' (check https://github.com/' + REPO + '/actions)');

if (!fs.existsSync(path.join(DIST, 'Seoul-Presentation.html'))) fail('dist/Seoul-Presentation.html (the offline single-file version) is missing');
const probes = ['', 'index.html', 'index.html?view=presenter', 'Seoul-Presentation.html'];
for (const f of files) {
  const rel = path.relative(DIST, f).split(path.sep).join('/');
  if (/^assets\/(fonts|img)\//.test(rel) && probes.filter(p => p.startsWith('assets/')).length < 6) probes.push(rel);
}
let bad = 0;
for (const p of probes) {
  let code = 0;
  for (let t = 0; t < 5; t++) { // the CDN can lag a few seconds behind the build
    try { code = (await fetch(LIVE + p, { method: 'GET', cache: 'no-store' })).status; } catch { code = 0; }
    if (code === 200) break;
    sleep(5000);
  }
  if (code !== 200) bad++;
  console.log('  ' + code + '  ' + LIVE + p);
}
if (bad) fail(bad + ' URL(s) did not return 200');
console.log('\nPublished and verified: ' + LIVE);
