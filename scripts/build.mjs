#!/usr/bin/env node
// Seoul deck build (MAIN session). Pure HTML output: one inline classic script, inline CSS with base64 fonts.
//
//   node scripts/build.mjs [--entry <file>] [--no-copy] [--no-single] [--quiet]
//
//   --entry <file>  bundle another entry instead of src/engine/main.js (testing)
//   --no-copy       leave spec/copy-v2.json out (data.copy = null); by default the copy-v2 wording is applied
//   --no-single     skip dist/Seoul-Presentation.html (faster local iterations)
//   --images-manifest <file>  test only: use this manifest instead of spec/images.json (paths relative to the workspace)
//   --out <dir>     test only: write the HTML files to <dir> instead of dist/ (no image mirroring, no stale cleanup)
//
// Steps
//   0. src/slides/references.json   <- section 10 of the research dossier (only rewritten when it changed)
//   a. src/engine/diagrams.generated.js  <- src/diagrams/*.js that bundle standalone and export { id, states, region, create }
//      (s00-* test modules and ids not in spec/timing.json are skipped; anything else that fails logs "fallback: <id> (<reason>)")
//      src/engine/data.generated.js      <- the JSON inputs that exist (slides, timing, references, images, notes-v2, copy-v2)
//   b. bundle src/engine/main.js with esbuild: iife, globalName SeoulDeck, JSON inlined, minified, chrome110, in memory
//   c. ONE CSS string: tokens.css + deck.css + presenter.css + print.css, every Montserrat woff2 url() -> base64 data URI
//   d. dist/index.html (images as relative assets/img/*.jpg, copied into dist/assets/img/) and
//      dist/Seoul-Presentation.html (identical, images inlined as base64 after resizing to <= 1920 px, JPEG q80)
//   e. stale outputs from the old multi-file build are deleted
//   f. every write is atomic (temp file, then rename)
//   g. summary with both file sizes
//
// No servers, no workers, no ES modules at runtime, no fetch: the result runs from a double-clicked file.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(WS, ...p);
const OUT_DIR = optvEarly('--out');
const DIST = OUT_DIR ? path.resolve(WS, OUT_DIR) : P('dist');
const IMAGES_MANIFEST = optvEarly('--images-manifest') || 'spec/images.json';
function optvEarly(n) { const a = process.argv.slice(2); const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; }
const DOSSIER = 'C:/Users/erick/OneDrive/Documents/CUNY/Fall 2026/ARCH 3551- Sustainability History & Practice/Research Presentation/01-Seoul-Research-Dossier.md';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const optv = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const QUIET = flag('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const warn = (...a) => console.warn(...a);
const t0 = Date.now();

// ---------------------------------------------------------------- helpers
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Atomic write: temp file in the same folder, then rename over the target (retries while a viewer holds it). */
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.rmSync(tmp, { force: true }); } catch {} throw e; }
      sleepSync(150);
    }
  }
}
/** Write only when the content changed (keeps generated sources stable for watchers and other sessions). */
function writeIfChanged(file, text) {
  try { if (fs.readFileSync(file, 'utf8') === text) return false; } catch {}
  writeAtomic(file, text);
  return true;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const rel = (f) => path.relative(WS, f).split(path.sep).join('/');
const shortErr = (e) => String((e && (e.errors && e.errors[0] && e.errors[0].text)) || (e && e.message) || e).split('\n')[0].slice(0, 160);

const timing = readJson(P('spec/timing.json'));

// ---------------------------------------------------------------- 0. references from the dossier (section 10)
function refreshReferences() {
  const out = P('src/slides/references.json');
  let md = null;
  try { md = fs.readFileSync(DOSSIER, 'utf8'); } catch { /* OneDrive path unavailable: keep the committed copy */ }
  if (!md) {
    if (!exists(out)) warn('warn: dossier not readable and src/slides/references.json missing; the appendix will list image credits only');
    return;
  }
  const start = md.search(/^## 10\.[^\n]*$/m);
  if (start < 0) { warn('warn: dossier has no "## 10." section; references.json left as it is'); return; }
  const rest = md.slice(start).split('\n').slice(1);
  const groups = [];
  for (const line of rest) {
    if (/^## /.test(line) || /^---\s*$/.test(line)) break;
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) { groups.push({ name: h[1], items: [] }); continue; }
    const it = /^\s*[-*]\s+\[(.+?)\]\((\S+?)\)\s*$/.exec(line) || /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (it && groups.length) groups[groups.length - 1].items.push(it[2] ? { title: it[1], url: it[2] } : { title: it[1] });
  }
  const data = { source: '01-Seoul-Research-Dossier.md section 10', groups: groups.filter((g) => g.items.length) };
  const n = data.groups.reduce((a, g) => a + g.items.length, 0);
  if (writeIfChanged(out, JSON.stringify(data, null, 1) + '\n')) log(`references: ${n} titles in ${data.groups.length} groups -> ${rel(out)}`);
}

// ---------------------------------------------------------------- a. diagram registry + data module
const timingDiagrams = new Map();
for (const s of timing.order) for (const d of s.diagrams || []) timingDiagrams.set(d.id, { ...d, slide: s.key, used: Math.max(0, ...(s.beats || []).map((b) => (b.diagram && b.diagram[d.id]) || 0)) });

const sameRegion = (a, b) => a && b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(Number(a[k]) - Number(b[k])) < 0.5);

async function checkDiagram(id, file, tmpDir) {
  let res;
  try {
    res = await esbuild.build({
      entryPoints: [file], bundle: true, format: 'esm', platform: 'browser', target: 'chrome110',
      write: false, loader: { '.json': 'json' }, logLevel: 'silent', legalComments: 'none',
      outfile: path.join(tmpDir, id + '.mjs'),
    });
  } catch (e) {
    return { ok: false, reason: 'bundle error: ' + shortErr(e) };
  }
  const code = res.outputFiles[0].text;
  const out = path.join(tmpDir, id + '.mjs');
  fs.writeFileSync(out, code);
  let mod;
  try { mod = await import(pathToFileURL(out).href + '?v=' + Date.now()); } catch (e) {
    return { ok: false, reason: 'module threw on load: ' + shortErr(e) };
  }
  const d = mod && mod.default;
  if (!d || typeof d !== 'object') return { ok: false, reason: 'no default export object' };
  const missing = ['id', 'states', 'region', 'create'].filter((k) => d[k] === undefined || d[k] === null);
  if (missing.length) return { ok: false, reason: 'default export lacks ' + missing.join(', ') };
  if (typeof d.create !== 'function') return { ok: false, reason: 'create is not a function' };
  if (d.id !== id) return { ok: false, reason: `id "${d.id}" does not match the file name` };
  if (!Number.isInteger(d.states) || d.states < 0) return { ok: false, reason: 'states is not a non-negative integer' };
  const t = timingDiagrams.get(id);
  if (!sameRegion(d.region, t.region)) return { ok: false, reason: `region ${JSON.stringify(d.region)} != timing.json ${JSON.stringify(t.region)}` };
  const notes = [];
  if (d.states < t.used) notes.push(`states ${d.states} < state ${t.used} used in timing.json (clamped)`);
  return { ok: true, notes, bytes: code.length };
}

async function generateDiagrams() {
  const dir = P('src/diagrams');
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).sort() : [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seoul-build-'));
  const included = [], fallback = [];
  try {
    const ids = [];
    for (const f of files) {
      const id = f.replace(/\.js$/, '');
      if (/^s00-/.test(id)) continue;
      if (!timingDiagrams.has(id)) { log(`skip: ${id} (not in spec/timing.json)`); continue; }
      ids.push(id);
    }
    const results = await Promise.all(ids.map((id) => checkDiagram(id, path.join(dir, id + '.js'), tmpDir).catch((e) => ({ ok: false, reason: shortErr(e) }))));
    ids.forEach((id, i) => {
      const r = results[i];
      if (r.ok) { included.push(id); log(`diagram: ${id} (${(r.bytes / 1024).toFixed(0)} KB standalone)${r.notes.length ? ' note: ' + r.notes.join('; ') : ''}`); }
      else { fallback.push(id); log(`fallback: ${id} (${r.reason})`); }
    });
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
  for (const id of timingDiagrams.keys()) if (!files.includes(id + '.js')) { fallback.push(id); log(`fallback: ${id} (no module in src/diagrams)`); }

  const lines = [
    '// GENERATED by scripts/build.mjs - do not edit. 3D diagram modules that bundle standalone and match spec/timing.json.',
    '// Every other diagram id falls back to its Figma 2D elements on the slide.',
    ...included.map((id, i) => `import d${i} from '../diagrams/${id}.js';`),
    'export default {',
    ...included.map((id, i) => `  '${id}': d${i},`),
    '};',
    '',
  ];
  writeIfChanged(P('src/engine/diagrams.generated.js'), lines.join('\n'));
  return { included, fallback: [...new Set(fallback)] };
}

function generateData() {
  const inputs = [
    { name: 'slidesSpec', file: 'spec/slides.json', required: true },
    { name: 'timing', file: 'spec/timing.json', required: true },
    { name: 'references', file: 'src/slides/references.json' },
    { name: 'images', file: IMAGES_MANIFEST },
    { name: 'notesV2', file: 'spec/notes-v2.json' },
    { name: 'copy', file: 'spec/copy-v2.json', only: !flag('--no-copy') },
  ];
  const imports = [], fields = [], present = [];
  inputs.forEach((inp, i) => {
    const ok = inp.only !== false && exists(P(inp.file));
    if (!ok && inp.required) throw new Error(`${inp.file} is missing`);
    if (ok) {
      try { readJson(P(inp.file)); } catch (e) { if (inp.required) throw e; warn(`warn: ${inp.file} is not valid JSON (${shortErr(e)}); left out`); fields.push(`  ${inp.name}: null,`); return; }
      const from = path.relative(P('src/engine'), P(inp.file)).split(path.sep).join('/');
      imports.push(`import j${i} from '${from.startsWith('.') ? from : './' + from}';`);
      fields.push(`  ${inp.name}: j${i},`);
      present.push(inp.name);
    } else fields.push(`  ${inp.name}: null,`);
  });
  const text = [
    '// GENERATED by scripts/build.mjs - do not edit. The JSON inputs, inlined into the bundle (no fetch at runtime).',
    '// A missing optional file is null. `copy` (spec/copy-v2.json) is left out only with --no-copy.',
    ...imports,
    'export default {',
    ...fields,
    '};',
    '',
  ].join('\n');
  writeIfChanged(P('src/engine/data.generated.js'), text);
  return present;
}

// ---------------------------------------------------------------- b. JS bundle
async function bundle(entry) {
  const res = await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'iife', globalName: 'SeoulDeck', platform: 'browser',
    target: 'chrome110', minify: true, write: false, loader: { '.json': 'json' }, legalComments: 'none',
    charset: 'utf8', logLevel: 'silent', outfile: path.join(os.tmpdir(), 'seoul-deck.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
  }).catch((e) => { throw new Error('esbuild failed:\n' + (e.errors || []).map((x) => `  ${x.location ? x.location.file + ':' + x.location.line + ' ' : ''}${x.text}`).join('\n')); });
  let js = res.outputFiles[0].text;
  // Safe to inline inside <script>: never let the HTML parser see a closing tag or a comment opener.
  js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\x3C!--');
  const risky = { 'ES module import()': /\bimport\(/.test(js), 'new Worker': /new Worker\(/.test(js) };
  for (const [k, v] of Object.entries(risky)) if (v) warn(`warn: bundle contains ${k}; it will not work from file://`);
  return js;
}

// ---------------------------------------------------------------- c. CSS with inline fonts
const FONT_WEIGHTS = [300, 400, 500, 600, 700, 900];
function buildCss() {
  const parts = ['tokens.css', 'deck.css', 'presenter.css', 'print.css'].map((f) => {
    const file = P('src/styles', f);
    if (!exists(file)) throw new Error(`src/styles/${f} is missing`);
    return `/* ${f} */\n` + fs.readFileSync(file, 'utf8');
  });
  let css = parts.join('\n');
  const used = new Set();
  css = css.replace(/url\(\s*(["']?)([^"')]*?montserrat-[a-z-]+-\d{3}-normal\.woff2)\1\s*\)/gi, (m, q, u) => {
    const name = path.basename(u);
    const file = P('assets/fonts', name);
    if (!exists(file)) throw new Error(`font ${name} referenced by the CSS is missing in assets/fonts`);
    used.add(name);
    return `url("data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}")`;
  });
  const want = FONT_WEIGHTS.flatMap((w) => [`montserrat-latin-${w}-normal.woff2`, `montserrat-latin-ext-${w}-normal.woff2`]);
  const lacking = want.filter((n) => !used.has(n));
  if (lacking.length) throw new Error('CSS lacks @font-face rules for: ' + lacking.join(', '));
  const leftovers = [...css.matchAll(/url\(\s*["']?(?!data:)([^"')]+)/gi)].map((m) => m[1]).filter((u) => !/^#/.test(u));
  if (leftovers.length) throw new Error('CSS still references separate files (blocked on file://): ' + leftovers.join(', '));
  css = esbuild.transformSync(css, { loader: 'css', minify: true, target: 'chrome110', legalComments: 'none' }).code;
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

// ---------------------------------------------------------------- d. images
function imageRefs() {
  const file = P(IMAGES_MANIFEST);
  if (!exists(file)) return [];
  let man;
  try { man = readJson(file); } catch (e) { warn(`warn: spec/images.json unreadable (${shortErr(e)})`); return []; }
  const refs = new Set();
  for (const p of man.pairs || []) for (const side of ['seoul', 'nyc']) {
    const en = p && p[side];
    if (en && en.file && en.status !== 'user-supply' && en.status !== 'missing') refs.add(String(en.file).replace(/^\.\//, ''));
  }
  return [...refs];
}

function mirrorImages() {
  const src = P('assets/img');
  const dst = path.join(DIST, 'assets/img');
  const files = exists(src) ? fs.readdirSync(src).filter((f) => fs.statSync(path.join(src, f)).isFile() && !/\.tmp-/.test(f)) : [];
  if (!files.length) { if (exists(dst)) fs.rmSync(dst, { recursive: true, force: true }); return 0; }
  fs.mkdirSync(dst, { recursive: true });
  let copied = 0;
  for (const f of files) {
    const a = path.join(src, f), b = path.join(dst, f);
    const sa = fs.statSync(a);
    let same = false;
    try { const sb = fs.statSync(b); same = sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs; } catch {}
    if (!same) { writeAtomic(b, fs.readFileSync(a)); copied++; }
  }
  for (const f of fs.readdirSync(dst)) if (!files.includes(f)) fs.rmSync(path.join(dst, f), { recursive: true, force: true });
  return files.length;
}

async function loadSharp() {
  const p = P('.tmp/main/tools/node_modules/sharp/lib/index.js');
  if (!exists(p)) return null;
  try { return (await import(pathToFileURL(p).href)).default; } catch (e) { warn('warn: sharp failed to load (' + shortErr(e) + ')'); return null; }
}

async function inlineImages(refs) {
  const map = {};
  if (!refs.length) return { map, bytes: 0, note: 'no images referenced by spec/images.json' };
  const sharp = await loadSharp();
  const cacheDir = path.join(os.tmpdir(), 'seoul-deck-img-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  let bytes = 0, raw = 0, missing = [];
  for (const r of refs) {
    const file = P(r);
    if (!exists(file)) { missing.push(r); continue; }
    const buf = fs.readFileSync(file);
    const ext = path.extname(r).toLowerCase();
    let out = buf, mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    if (sharp) {
      const key = crypto.createHash('sha1').update(buf).digest('hex') + '-1920-q80.jpg';
      const cached = path.join(cacheDir, key);
      if (exists(cached)) out = fs.readFileSync(cached);
      else {
        out = await sharp(buf).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
        if (out.length > buf.length && ext !== '.png') out = buf; // never grow a file that was already small
        fs.writeFileSync(cached, out);
      }
      if (out !== buf) mime = 'image/jpeg';
    } else raw += buf.length;
    bytes += out.length;
    map[r] = `data:${mime};base64,${out.toString('base64')}`;
  }
  if (missing.length) warn(`warn: ${missing.length} image(s) in spec/images.json not found in assets/img: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' ...' : ''}`);
  const note = sharp ? `${Object.keys(map).length} images resized to <= 1920 px, q80` : `sharp not available: ${Object.keys(map).length} images inlined as original bytes (${mb(raw)})`;
  return { map, bytes, note };
}

// ---------------------------------------------------------------- HTML
const TITLE = 'Seoul: The Carrot and the Stick';
function page({ css, js, images }) {
  // Image map for the single-file build: a JSON data block (not a script), read by src/engine/images.js.
  const imgBlock = images && Object.keys(images).length
    ? `<script type="application/json" id="seoul-images">${JSON.stringify(images).replace(/</g, '\\u003c')}</script>\n`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="description" content="ARCH 3551 research presentation by Erickson Cabrera, comparing Seoul and New York sustainability policy.">
<title>${TITLE}</title>
<style>${css}</style>
</head>
<body>
${imgBlock}<noscript><p style="font:500 18px/1.5 Montserrat,sans-serif;padding:40px;color:#111112;background:#fff">This presentation needs JavaScript. Open it in Chrome or Edge.</p></noscript>
<script>${js}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- e. stale outputs
function removeStale() {
  // One page, three views (?view=presenter, ?view=print): the only HTML files are the two deliverables.
  const KEEP_HTML = new Set(['index.html', 'Seoul-Presentation.html']);
  const gone = [];
  if (exists(DIST)) for (const f of fs.readdirSync(DIST)) {
    const p = path.join(DIST, f);
    if (!fs.statSync(p).isFile()) continue;
    const stale = (/\.html$/i.test(f) && !KEEP_HTML.has(f)) || /\.(css|js|map)$/i.test(f) || /\.tmp-\d+-/.test(f);
    if (stale) { fs.rmSync(p, { force: true }); gone.push(f); }
  }
  const fonts = path.join(DIST, 'assets/fonts'); // fonts are inlined now
  if (exists(fonts)) { fs.rmSync(fonts, { recursive: true, force: true }); gone.push('assets/fonts/'); }
  return gone;
}

// ---------------------------------------------------------------- main
async function main() {
  refreshReferences();
  const diag = await generateDiagrams();
  const present = generateData();

  const entry = path.resolve(WS, optv('--entry') || 'src/engine/main.js');
  if (!exists(entry)) throw new Error(`${rel(entry)} does not exist (the integrator writes src/engine/main.js; use --entry <file> to build another entry)`);
  const [js, css] = await Promise.all([bundle(entry), Promise.resolve().then(buildCss)]);

  fs.mkdirSync(DIST, { recursive: true });
  const gone = OUT_DIR ? [] : removeStale();
  const nImg = OUT_DIR ? 0 : mirrorImages();
  const webHtml = page({ css, js, images: null });
  writeAtomic(path.join(DIST, 'index.html'), webHtml);

  let single = null, imgInfo = { note: 'skipped (--no-single)' };
  if (!flag('--no-single')) {
    imgInfo = await inlineImages(imageRefs());
    const html = page({ css, js, images: imgInfo.map });
    writeAtomic(path.join(DIST, 'Seoul-Presentation.html'), html);
    single = Buffer.byteLength(html);
  }

  const nFaces = FONT_WEIGHTS.length * 2;
  const outRel = (f) => rel(path.join(DIST, f));
  console.log('\nSeoul deck build');
  console.log(`  entry            ${rel(entry)}`);
  console.log(`  data             ${present.join(', ')}`);
  console.log(`  3D diagrams      ${diag.included.length} bundled${diag.included.length ? ': ' + diag.included.join(', ') : ''}`);
  console.log(`  2D fallbacks     ${diag.fallback.length}${diag.fallback.length ? ': ' + diag.fallback.join(', ') : ''}`);
  console.log(`  JS               ${mb(Buffer.byteLength(js))} (one inline classic script)`);
  console.log(`  CSS              ${mb(Buffer.byteLength(css))} (${nFaces} Montserrat faces inlined)`);
  console.log(`  images           ${OUT_DIR ? 'not mirrored (--out)' : nImg + ' file(s) in dist/assets/img'}; single file: ${imgInfo.note}`);
  if (gone.length) console.log(`  removed stale    ${gone.join(', ')}`);
  console.log(`  ${outRel('index.html').padEnd(30)}${mb(Buffer.byteLength(webHtml))}`);
  console.log(`  ${outRel('Seoul-Presentation.html').padEnd(30)}${single == null ? 'not built' : mb(single)}`);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error('\nBUILD FAILED: ' + (e && e.message || e)); process.exit(1); });
