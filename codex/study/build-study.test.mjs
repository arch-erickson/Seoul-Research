import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'spec', name + '.json'), 'utf8'));
const output = path.join(root, 'codex/study/Seoul-Study-Guide.html');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const build = spawnSync(process.execPath, ['scripts/build-study.mjs'], { cwd:root, encoding:'utf8' });

test('build creates the self-contained study page', () => {
  assert.equal(build.status, 0, build.stderr);
  assert.ok(fs.existsSync(output), 'the study HTML must be created');
  assert.ok(fs.statSync(output).size > 100000, 'guide must include source material and embedded fonts');
});
test('every source key and current timing entry has exactly one anchor in true order', () => {
  const html = fs.readFileSync(output, 'utf8');
  let previous = -1;
  for (const entry of read('timing').order) {
    const anchor = `id="${entry.key}" data-study-key=`;
    assert.equal(html.split(anchor).length - 1, 1, entry.key);
    const at = html.indexOf(anchor); assert.ok(at > previous); previous = at;
  }
  for (const slide of read('study-v2').slides) assert.ok(html.includes(`id="${slide.key}" data-study-key=`));
});
test('run of show and chapter windows come from current durations', () => {
  const html = fs.readFileSync(output, 'utf8'); let elapsed = 0;
  for (const slide of read('timing').order) {
    assert.ok(html.includes(`data-start="${elapsed}" data-end="${elapsed + slide.dur}" data-duration="${slide.dur}"`), slide.key);
    elapsed += slide.dur;
  }
  assert.ok(html.includes(`data-total-seconds="${elapsed}"`)); assert.equal(elapsed, 2310);
});
test('current copy headlines and every nonremoved text element are preserved', () => {
  const html = fs.readFileSync(output, 'utf8');
  for (const slide of read('copy-v2')) {
    assert.ok(html.includes(esc(slide.headline)), slide.key);
    for (const item of slide.elements.filter(e => e.action !== 'remove')) {
      assert.ok(html.includes(`data-copy-id="${esc(item.id)}">${esc(item.new)}`), `${slide.key} ${item.id}`);
    }
  }
});
test('all research fields, sources, cautions and glossary terms remain verbatim', () => {
  const html = fs.readFileSync(output, 'utf8');
  for (const slide of read('study-v2').slides) {
    const strings = [slide.inOneSentence, ...(slide.background || []), slide.explainSimply, ...(slide.dontSay || []), slide.nycLink, slide.seoul, slide.nyc, slide.why, slide.howToCite, ...(slide.keySources || []), ...(slide.numbers || []).flatMap(n => [n.value,n.meaning,n.source,n.note]), ...(slide.questions || []).flatMap(q => [q.q,q.a]), ...(slide.terms || []).flatMap(t => [t.term,t.meaning])].filter(Boolean);
    for (const text of strings) assert.ok(html.includes(esc(text)), `${slide.key}: ${text.slice(0,60)}`);
  }
  for (const item of read('study-v2-extras').glossary) assert.ok(html.includes(esc(item.definition)));
});
test('notes have beat cues and highlighted quotations without duplicate Say this lines', () => {
  const html = fs.readFileSync(output, 'utf8');
  assert.match(html, /class="note-cue"/); assert.match(html, /class="spoken-line"/);
  const first = html.slice(html.indexOf('id="s01" data-study-key='), html.indexOf('id="i01" data-study-key='));
  assert.equal(first.split('How many of you composted last night?').length - 1, 1);
  assert.match(first, /already highlighted in Your notes/);
});
test('whole HTML is dash-free and loads no external assets, modules, or workers', () => {
  const html = fs.readFileSync(output, 'utf8');
  assert.doesNotMatch(html, /[\u2013\u2014]/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|type="module"|\bfetch\(|\bXMLHttpRequest\b|new Worker\(/);
  assert.match(html, /data:font\/woff2;base64,/);
  assert.match(html, /Seoul: The Carrot and the Stick/);
});
