#!/usr/bin/env node
// Save progress to GitHub (arch-erickson/Seoul-Research) after each finished piece of work, so nothing is
// lost if a session stops. Safe to run from any session at any time: a lock lets one checkpoint run at once.
//
// Usage:  node scripts/checkpoint.mjs --message "s10 diagram done" [--no-site]
//
// Every run commits a snapshot of the work to main and pushes it: src/, scripts/, spec/, assets/img/,
// the copy/notes/study drafts (drafts/), and the STATUS files.
// The LIVE SITE (docs/) is updated only when the deck builds and passes a strict, offline smoke test
// (it opens like a double-clicked file with no internet, with no runtime errors and Montserrat loaded).
// Otherwise the site keeps its last working version and the commit message says why.
// --no-site skips the build and the site update (source snapshot only; fastest).

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_REPO || 'C:/Users/erick/AppData/Local/Temp/claude/seoul-research-site';
const REPO = 'arch-erickson/Seoul-Research';
const LOCK = path.join(WS, '.tmp', 'checkpoint.lock');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const message = opt('--message') || 'Checkpoint';

// ---------- lock ----------
fs.mkdirSync(path.dirname(LOCK), { recursive: true });
let locked = false;
for (let i = 0; i < 150 && !locked; i++) {
  try { fs.mkdirSync(LOCK); locked = true; }
  catch {
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 15 * 60 * 1000) { fs.rmSync(LOCK, { recursive: true, force: true }); continue; } } catch {}
    if (i === 0) console.log('Another checkpoint is running; waiting...');
    sleep(2000);
  }
}
if (!locked) { console.error('CHECKPOINT STOPPED: could not get the lock after 5 minutes'); process.exit(1); }
const unlock = () => { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} };
process.on('exit', unlock);

const git = (...args) => {
  for (let i = 0; i < 6; i++) {
    const r = spawnSync('git', args, { cwd: SITE, encoding: 'utf8' });
    if (r.status === 0) return (r.stdout || '').trim();
    if (/index\.lock|another git process/i.test(r.stderr || '')) { sleep(3000); continue; }
    throw new Error('git ' + args.join(' ') + ' failed:\n' + (r.stderr || r.stdout));
  }
  throw new Error('git ' + args.join(' ') + ': repository stayed locked');
};

try {
  if (!fs.existsSync(path.join(SITE, '.git'))) execFileSync('gh', ['repo', 'clone', REPO, SITE], { stdio: 'inherit' });

  // ---------- 1. live site, only if the deck really works ----------
  let siteNote = 'site unchanged (--no-site)';
  if (!flag('--no-site')) {
    siteNote = 'site unchanged';
    const b = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: WS, encoding: 'utf8' });
    const single = path.join(WS, 'dist', 'Seoul-Presentation.html');
    if (b.status !== 0 || !fs.existsSync(single)) {
      siteNote = 'site unchanged: build did not finish';
    } else {
      const s = spawnSync(process.execPath, ['scripts/shot.mjs', single, '--dom', '--strict', '--offline', '--query', 'audit=1', '--wait', '12000'], { cwd: WS, encoding: 'utf8', timeout: 240000 });
      let audit = null;
      try { audit = JSON.parse((s.stdout || '').trim().split('\n').pop()); } catch {}
      const errs = audit && Array.isArray(audit.runtimeErrors) ? audit.runtimeErrors.length : null;
      const fontsOk = audit ? audit.fontsOk !== false : false;
      if (!audit) siteNote = 'site unchanged: smoke test produced no audit result';
      else if (errs > 0) siteNote = 'site unchanged: ' + errs + ' runtime error(s) in the smoke test';
      else if (!fontsOk) siteNote = 'site unchanged: Montserrat did not load in the smoke test';
      else {
        // publish-pages does the exact-letter-case and size checks, then mirrors dist/ into docs/ (staged, not committed)
        const p = spawnSync(process.execPath, ['scripts/publish-pages.mjs', '--no-build', '--dry'], { cwd: WS, encoding: 'utf8' });
        siteNote = p.status === 0 ? 'site updated' : 'site unchanged: publish checks failed: ' + ((p.stderr || p.stdout || '').split('PUBLISH STOPPED:').pop() || '').trim().slice(0, 300);
      }
    }
  }

  // ---------- 2. source snapshot ----------
  const skip = (src) => {
    const rel = path.relative(WS, src).split(path.sep).join('/');
    return rel.includes('node_modules') || /(^|\/)s00-[^/]*$/.test(rel) || /\.log$/.test(rel);
  };
  for (const d of ['src', 'scripts', 'spec']) {
    fs.rmSync(path.join(SITE, d), { recursive: true, force: true });
    if (fs.existsSync(path.join(WS, d))) fs.cpSync(path.join(WS, d), path.join(SITE, d), { recursive: true, filter: (x) => !skip(x) });
  }
  fs.rmSync(path.join(SITE, 'assets'), { recursive: true, force: true });
  if (fs.existsSync(path.join(WS, 'assets', 'img'))) fs.cpSync(path.join(WS, 'assets', 'img'), path.join(SITE, 'assets', 'img'), { recursive: true });
  fs.rmSync(path.join(SITE, 'drafts'), { recursive: true, force: true });
  for (const d of ['copy', 'notes', 'study']) {
    const from = path.join(WS, '.tmp', 'main', d);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(SITE, 'drafts', d), { recursive: true });
  }
  for (const f of ['package.json', 'ARCHITECTURE.md', 'STATUS-MAIN.md', 'STATUS-3D.md', 'STATUS-IMAGES.md']) {
    if (fs.existsSync(path.join(WS, f))) fs.copyFileSync(path.join(WS, f), path.join(SITE, f));
  }

  // ---------- 3. commit + push ----------
  git('add', '-A');
  if (!git('status', '--porcelain')) { console.log('Nothing new to save. (' + siteNote + ')'); process.exit(0); }
  const body = message + '\n\n' + siteNote[0].toUpperCase() + siteNote.slice(1) + '.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n';
  execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: SITE, input: body });
  const sha = git('rev-parse', '--short', 'HEAD');
  try { git('push', '-q', 'origin', 'main'); }
  catch { git('pull', '-q', '--rebase', 'origin', 'main'); git('push', '-q', 'origin', 'main'); }
  console.log('Saved ' + sha + ' to https://github.com/' + REPO + ' (' + siteNote + ').');
} catch (e) {
  console.error('CHECKPOINT STOPPED: ' + (e && e.message ? e.message : e));
  process.exit(1);
}
