#!/usr/bin/env node
// Headless screenshot / DOM-dump helper shared by all sessions.
// Usage:
//   node scripts/shot.mjs <page.html> [--query "slide=10&beat=6&static=1"] [--out .tmp/x.png]
//                         [--w 1920] [--h 1080] [--wait 6000] [--browser chrome|edge] [--dom] [--strict]
// --strict drops --allow-file-access-from-files: use it for every final check (it matches a plain double-click).
// --dom prints the page's <script id="audit-result" type="application/json"> contents
//       (or the whole DOM if absent) instead of taking a screenshot.
// Every run uses a throwaway --user-data-dir, so many shots can run concurrently.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const argv = process.argv.slice(2);
const opt = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    opt[k] = v;
  } else opt._.push(a);
}
if (!opt._[0]) { console.error('usage: node scripts/shot.mjs <page.html> [--query q] [--out f.png] [--dom]'); process.exit(2); }

const BROWSERS = {
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe'],
  edge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
};
const pick = (opt.browser && BROWSERS[opt.browser]) || [...BROWSERS.chrome, ...BROWSERS.edge];
const exe = pick.find(p => fs.existsSync(p));
if (!exe) { console.error('No Chrome/Edge found'); process.exit(2); }

const target = path.resolve(opt._[0]);
const url = pathToFileURL(target).href + (opt.query ? '?' + String(opt.query).replace(/^\?/, '') : '');
const w = Number(opt.w || 1920), h = Number(opt.h || 1080), wait = Number(opt.wait || 6000);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));

const flags = [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  `--user-data-dir=${profile}`, `--window-size=${w},${h}`, `--virtual-time-budget=${wait}`,
];
// --strict = behave exactly like a double-clicked file on the college PC: no file-access exemption,
// so local fetch/XHR, separate font files and file:// textures fail just as they would there.
if (!opt.strict) flags.push('--allow-file-access-from-files');
// --offline = no internet at all (every hostname fails to resolve), to prove the deck needs no network.
if (opt.offline) flags.push('--host-resolver-rules=MAP * ~NOTFOUND');
let res;
if (opt.dom) {
  res = spawnSync(exe, [...flags, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
  const dom = res.stdout || '';
  const m = dom.match(/<script[^>]*id="audit-result"[^>]*>([\s\S]*?)<\/script>/);
  process.stdout.write(m ? m[1].trim() + '\n' : dom);
} else {
  const out = path.resolve(opt.out || '.tmp/shot.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true }); // an older PNG with this name must not pass for a fresh one after a timeout
  res = spawnSync(exe, [...flags, `--screenshot=${out}`, url], { encoding: 'utf8', timeout: 180000 });
  if (fs.existsSync(out)) console.log(out); else { console.error('screenshot failed\n' + (res.stderr || '').slice(-2000)); }
}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(res.status ?? 0);
