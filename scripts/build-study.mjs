#!/usr/bin/env node
// Build a completely offline, source-faithful study guide. No build dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'codex/study');
const snapshots = new Map();
function input(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  snapshots.set(file, text);
  return text;
}
const study = JSON.parse(input('spec/study-v2.json'));
const extras = JSON.parse(input('spec/study-v2-extras.json'));
const timing = JSON.parse(input('spec/timing.json'));
const copy = JSON.parse(input('spec/copy-v2.json'));
const notes = JSON.parse(input('spec/notes-v2.json'));
const architecture = input('ARCHITECTURE.md');
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[ch]);
const json = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const stamp = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const byKey = new Map(study.slides.map(slide => [slide.key, slide]));
const copyByKey = new Map(copy.map(slide => [slide.key, slide]));
let elapsed = 0;
const entries = timing.order.map((entry, index) => {
  if (!Number.isFinite(entry.dur) || entry.dur < 0) throw new Error(`Invalid duration for ${entry.key}`);
  const source = byKey.get(entry.key) || {};
  const entryCopy = copyByKey.get(entry.key);
  const title = entryCopy?.headline || source.title || entry.title || entry.key;
  const start = elapsed;
  elapsed += entry.dur;
  const label = entry.kind === 'content' ? `Slide ${String(entry.n).padStart(2,'0')}`
    : entry.kind === 'image' ? `Photo ${entry.key.slice(1)}`
    : entry.kind === 'appendix' ? 'References' : entry.kind === 'qa' ? 'Discussion' : 'Closing';
  return { ...entry, source, copy:entryCopy, title, label, index, start, end:elapsed };
});
const total = elapsed;
for (const source of study.slides) if (!entries.some(entry => entry.key === source.key)) throw new Error(`Study entry ${source.key} is missing from timing.json`);
if (new Set(entries.map(entry => entry.key)).size !== entries.length) throw new Error('Duplicate slide keys in timing.json');

const bold = text => esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const paragraphs = values => (Array.isArray(values) ? values : [values]).filter(Boolean).map(text => `<p>${esc(text)}</p>`).join('');
const list = values => `<ul>${(values || []).map(text => `<li>${esc(text)}</li>`).join('')}</ul>`;
const normalizeQuote = text => String(text).trim().replace(/^["“]|["”]$/g,'').replace(/\s+/g,' ');
function quotedLines(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => /^(?:".*"|“.*”)$/.test(line));
}
function renderNotes(text) {
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const cue = line.match(/^\*\*\[(\d+:\d{2})\]\s*(.*?)\*\*$/);
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bold(line.slice(2))}</li>`;
    } else {
      closeList();
      if (cue) html += `<h4 class="note-cue"><span class="cue-time">[${esc(cue[1])}]</span> ${esc(cue[2])}</h4>`;
      else if (/^(?:".*"|“.*”)$/.test(line)) html += `<blockquote class="spoken-line"><p>${bold(line)}</p></blockquote>`;
      else html += `<p>${bold(line)}</p>`;
    }
  }
  closeList();
  return html;
}
function block(title, body, className = '') {
  return `<section class="study-block ${className}"><h3>${esc(title)}</h3>${body}</section>`;
}
function onSlide(entry) {
  const groups = new Map();
  for (const item of entry.copy?.elements || []) {
    if (item.action === 'remove') continue;
    const group = item.group || 'Slide text';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups].map(([group, elements]) => `<div class="copy-group"><h4>${esc(group)}</h4><ul>${elements.map(item => `<li data-copy-id="${esc(item.id)}">${esc(item.new)}</li>`).join('')}</ul></div>`).join('');
}
function numberTable(numbers) {
  return `<p class="confidence-legend">Confidence: <span class="confidence solid">solid</span> <span class="confidence varies">varies</span> <span class="confidence hedge">hedge</span>. Hedge means say it loosely.</p><table class="numbers-table"><caption class="sr-only">Key numbers, meaning and confidence</caption><thead><tr><th scope="col">Value</th><th scope="col">Meaning, source and note</th><th scope="col">Confidence</th></tr></thead><tbody>${numbers.map(number => {
    if (!['solid','varies','hedge'].includes(number.confidence)) throw new Error(`Invalid confidence: ${number.confidence}`);
    return `<tr><th scope="row" data-label="Value">${esc(number.value)}</th><td data-label="Meaning">${esc(number.meaning)}<p class="number-source"><strong>Source:</strong> ${esc(number.source)}</p>${number.note ? `<p class="number-note"><strong>Note:</strong> ${esc(number.note)}</p>` : ''}</td><td data-label="Confidence"><span class="confidence ${number.confidence}">${esc(number.confidence)}</span></td></tr>`;
  }).join('')}</tbody></table>`;
}
function chapter(entry) {
  const source = entry.source;
  const quoted = new Set(quotedLines(notes[entry.key]).map(normalizeQuote));
  const say = (source.sayThis || []).filter(line => !quoted.has(normalizeQuote(line)));
  const questions = (source.questions || []).map(question => `<details class="question"><summary>${esc(question.q)}</summary><div class="answer">${paragraphs(question.a)}</div></details>`).join('');
  const terms = `<dl class="terms">${(source.terms || []).map(term => `<div><dt>${esc(term.term)}</dt><dd>${esc(term.meaning)}</dd></div>`).join('')}</dl>`;
  return `<p class="one-sentence">${esc(source.inOneSentence)}</p>`
    + block('On the slide', onSlide(entry), 'slide-copy')
    + block('Your notes', renderNotes(notes[entry.key]), 'presenter-notes')
    + block('Background', paragraphs(source.background))
    + block('Key numbers', numberTable(source.numbers || []))
    + block('Explain it simply', paragraphs(source.explainSimply), 'simple-explanation')
    + block('Say this', say.length ? list(say) : '<p class="helper">These lines are already highlighted in Your notes.</p>', 'say-this')
    + block('Likely questions', questions)
    + block("Don't say", list(source.dontSay), 'cautions')
    + block('Terms', terms)
    + block('New York link', paragraphs(source.nycLink), 'nyc-link');
}
function photoCard(entry) {
  return `<div class="photo-pair"><section class="seoul"><h3>Seoul</h3>${paragraphs(entry.source.seoul)}</section><section class="nyc"><h3>New York</h3>${paragraphs(entry.source.nyc)}</section></div>${block('Why this pair is here', paragraphs(entry.source.why))}${notes[entry.key] ? `<details class="photo-notes"><summary>Your notes</summary><div class="presenter-notes">${renderNotes(notes[entry.key])}</div></details>` : ''}`;
}
function slideSection(entry) {
  const time = entry.dur ? `${stamp(entry.start)} to ${stamp(entry.end)}, ${stamp(entry.dur)} long` : `After ${stamp(entry.start)} · untimed`;
  let content;
  if (entry.kind === 'content') content = chapter(entry);
  else if (entry.kind === 'image') content = photoCard(entry);
  else if (entry.source.howToCite) content = block('How to cite', paragraphs(entry.source.howToCite)) + block('Key sources', list(entry.source.keySources)) + block('Your notes', renderNotes(notes[entry.key]));
  else content = (notes[entry.key] ? block('Your notes', renderNotes(notes[entry.key])) : '') + (entry.kind === 'qa' ? '<p>5 minutes of questions after the talk.</p><button class="secondary" data-open-mode="qa">Open Q&A practice</button>' : '');
  return `<article id="${esc(entry.key)}" data-study-key="${esc(entry.key)}" data-start="${entry.start}" data-end="${entry.end}" data-duration="${entry.dur}" class="slide-section kind-${esc(entry.kind)}"><header class="chapter-header"><p class="eyebrow">${esc(entry.label)}</p><h2>${esc(entry.title)}</h2><p class="time-window">${esc(time)}</p></header>${content}</article>`;
}
const questions = entries.flatMap(entry => (entry.source.questions || []).map(question => ({ ...question, key:entry.key, title:entry.title, label:entry.label })));
const clickerLines = architecture.split(/\r?\n/);
const clickerStart = clickerLines.findIndex(line => /^## 11\./.test(line));
if (clickerStart < 0) throw new Error('ARCHITECTURE.md section 11 is missing');
let clickerEnd = clickerLines.findIndex((line, index) => index > clickerStart && /^## /.test(line));
if (clickerEnd < 0) clickerEnd = clickerLines.length;
const clickerRows = clickerLines.slice(clickerStart, clickerEnd).filter(line => line.trim().startsWith('|')).map(line => line.trim().slice(1,-1).split('|').map(cell => cell.trim())).filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
if (clickerRows.length < 2) throw new Error('N27 button table is missing');
const clickerTable = `<table class="clicker-table"><caption>Norwii N27 native buttons</caption><thead><tr>${clickerRows[0].map(cell => `<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${clickerRows.slice(1).map(row => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row" data-label="${esc(clickerRows[0][index])}">${esc(cell)}</th>` : `<td data-label="${esc(clickerRows[0][index])}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const timeline = entries.filter(entry => entry.dur > 0).map(entry => `<a href="#${esc(entry.key)}" class="run-segment kind-${esc(entry.kind)}" style="width:${entry.dur / total * 100}%" title="${esc(entry.label + ': ' + entry.title + ', ' + stamp(entry.start) + ' to ' + stamp(entry.end))}" aria-label="${esc(entry.label + ': ' + entry.title + ', ' + stamp(entry.start) + ' to ' + stamp(entry.end))}">${entry.kind === 'content' ? `<span>${entry.n}</span>` : ''}</a>`).join('');
const nav = entries.map(entry => `<a class="slide-nav kind-${esc(entry.kind)}" href="#${esc(entry.key)}" data-nav-key="${esc(entry.key)}"><span class="nav-label">${esc(entry.label)}</span><span class="nav-title">${esc(entry.title)}</span><time>${stamp(entry.start)}</time></a>`).join('');
const searchText = Object.fromEntries(entries.map(entry => [entry.key, [entry.key, entry.label, entry.title, JSON.stringify(entry.source), (entry.copy?.elements || []).filter(item => item.action !== 'remove').map(item => item.new).join(' '), notes[entry.key] || ''].join(' ').toLocaleLowerCase()]));
const fonts = [400,500,700,900].map(weight => {
  const font = fs.readFileSync(path.join(root, `node_modules/@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff2`)).toString('base64');
  return `@font-face{font-family:Montserrat;font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${font}) format('woff2');font-display:swap}`;
}).join('\n');
const runtimeData = {
  flashcards:extras.flashcards, questions, searchText,
  counts:{ sections:entries.length, study:study.slides.length, copy:copy.reduce((sum, slide) => sum + slide.elements.filter(item => item.action !== 'remove').length,0), flashcards:extras.flashcards.length, questions:questions.length, glossary:extras.glossary.length, total },
};

// This function is serialized as one classic inline script in the output.
function bootStudy() {
  'use strict';
  const DATA = JSON.parse(document.getElementById('study-data').textContent);
  const query = new URLSearchParams(location.search || (window.__STUDY_CAPTURE_QUERY__ || ''));
  const errors = [];
  window.addEventListener('error', event => errors.push(event.message || 'Resource error'));
  window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  window.addEventListener('securitypolicyviolation', event => errors.push('Blocked resource: ' + event.blockedURI));
  const $ = id => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const storage = {
    get(key) { try { return localStorage.getItem('seoul-study-' + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem('seoul-study-' + key, value); } catch {} },
  };
  let mode = 'study';
  function setMode(next, { scroll = true } = {}) {
    if (!tabs.some(tab => tab.dataset.mode === next)) next = 'study';
    mode = next;
    for (const tab of tabs) {
      const active = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    }
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== mode; });
    document.body.dataset.mode = mode;
    if (scroll) window.scrollTo({ top:0, behavior:'instant' });
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
    tab.addEventListener('keydown', event => {
      let index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault(); setMode(tabs[index].dataset.mode); tabs[index].focus();
    });
  });
  document.querySelectorAll('[data-open-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.openMode)));

  const menu = $('slide-menu');
  menu.open = matchMedia('(min-width:1000px)').matches;
  const sections = [...document.querySelectorAll('[data-study-key]')];
  const navLinks = [...document.querySelectorAll('[data-nav-key]')];
  function filterSlides() {
    const search = $('slide-search').value.trim().toLocaleLowerCase();
    const words = search.split(/\s+/).filter(Boolean);
    let found = 0;
    for (const section of sections) {
      const visible = words.every(word => DATA.searchText[section.dataset.studyKey].includes(word));
      section.hidden = !visible;
      const link = navLinks.find(item => item.dataset.navKey === section.dataset.studyKey); link.hidden = !visible;
      if (visible) found++;
    }
    $('filter-count').textContent = search ? found + ' of ' + sections.length + ' sections' : sections.length + ' sections';
    $('search-empty').hidden = found !== 0;
    $('clear-search').hidden = !search;
    $('overview').hidden = !!search;
  }
  $('slide-search').addEventListener('input', () => { setMode('study', { scroll:false }); filterSlides(); });
  $('clear-search').addEventListener('click', () => { $('slide-search').value = ''; filterSlides(); $('slide-search').focus(); });
  function jumpTo(key) {
    const target = $(key);
    if (!target || !target.hasAttribute('data-study-key')) return;
    $('slide-search').value = ''; filterSlides(); setMode('study', { scroll:false });
    navLinks.forEach(link => {
      if (link.dataset.navKey === key) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
    });
    if (!matchMedia('(min-width:1000px)').matches) menu.open = false;
    target.scrollIntoView({ block:'start', behavior:'instant' });
  }
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || !$(anchor.hash.slice(1))?.hasAttribute('data-study-key')) return;
    event.preventDefault(); history.replaceState(null, '', location.href.split('#')[0] + anchor.hash); jumpTo(anchor.hash.slice(1));
  });
  window.addEventListener('hashchange', () => jumpTo(location.hash.slice(1)));

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
    $('theme-toggle').textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
  }
  setTheme(query.get('theme') || storage.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme); storage.set('theme', theme);
  });
  document.querySelectorAll('[data-check]').forEach(checkbox => {
    checkbox.checked = storage.get(checkbox.dataset.check) === 'true';
    checkbox.addEventListener('change', () => storage.set(checkbox.dataset.check, String(checkbox.checked)));
  });

  function shuffled(order) {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i],next[j]] = [next[j],next[i]]; }
    if (next.length > 1 && next.every((value,index) => value === order[index])) next.push(next.shift());
    return next;
  }
  let flashOrder = DATA.flashcards.map((_, index) => index), flashIndex = 0, flipped = false;
  function showFlash() {
    const card = DATA.flashcards[flashOrder[flashIndex]];
    $('flash-count').textContent = 'Card ' + (flashIndex + 1) + ' of ' + flashOrder.length;
    $('flash-face').textContent = flipped ? 'Answer' : 'Question';
    $('flash-text').textContent = flipped ? card.back : card.front;
    $('flash-card').setAttribute('aria-pressed', String(flipped));
    $('flash-card').setAttribute('aria-label', (flipped ? 'Answer: ' : 'Question: ') + (flipped ? card.back : card.front));
    $('flash-flip').textContent = flipped ? 'Show question' : 'Show answer';
  }
  function moveFlash(delta) { flashIndex = (flashIndex + delta + flashOrder.length) % flashOrder.length; flipped = false; showFlash(); }
  function flipFlash() { flipped = !flipped; showFlash(); }
  $('flash-card').addEventListener('click', flipFlash); $('flash-flip').addEventListener('click', flipFlash);
  $('flash-next').addEventListener('click', () => moveFlash(1)); $('flash-prev').addEventListener('click', () => moveFlash(-1));
  $('flash-shuffle').addEventListener('click', () => { flashOrder = shuffled(flashOrder); flashIndex = 0; flipped = false; showFlash(); });
  document.addEventListener('keydown', event => {
    if (mode !== 'flashcards' || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"],[role="tab"]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); moveFlash(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); moveFlash(-1); }
    else if ((event.code === 'Space' || event.key === ' ') && (!event.target.closest('button,a,summary') || event.target.closest('button') === $('flash-card'))) { event.preventDefault(); flipFlash(); }
  });

  let qaOrder = shuffled(DATA.questions.map((_, index) => index)), qaIndex = 0, answerShown = false;
  function showQuestion() {
    const item = DATA.questions[qaOrder[qaIndex]];
    $('qa-count').textContent = 'Question ' + (qaIndex + 1) + ' of ' + qaOrder.length;
    $('qa-source').textContent = item.label + ' · ' + item.title;
    $('qa-source').href = '#' + item.key;
    $('qa-question').textContent = item.q; $('qa-answer').textContent = item.a;
    $('qa-answer').hidden = !answerShown;
    $('qa-reveal').setAttribute('aria-expanded', String(answerShown));
    $('qa-reveal').textContent = answerShown ? 'Hide answer' : 'Show answer';
  }
  function moveQuestion(delta) { qaIndex = (qaIndex + delta + qaOrder.length) % qaOrder.length; answerShown = false; showQuestion(); }
  $('qa-reveal').addEventListener('click', () => { answerShown = !answerShown; showQuestion(); });
  $('qa-next').addEventListener('click', () => moveQuestion(1)); $('qa-prev').addEventListener('click', () => moveQuestion(-1));
  $('qa-shuffle').addEventListener('click', () => { qaOrder = shuffled(qaOrder); qaIndex = 0; answerShown = false; showQuestion(); });
  filterSlides(); showFlash(); showQuestion();
  setMode(query.get('mode') || 'study', { scroll:false });

  async function audit() {
    const checks = [];
    const check = (name, ok) => checks.push({ name, ok:!!ok });
    check('all current timing sections', sections.length === DATA.counts.sections);
    check('all visible copy elements', document.querySelectorAll('[data-copy-id]').length === DATA.counts.copy);
    check('talk is 38:30', Number($('run-of-show').dataset.totalSeconds) === 2310);
    check('no duplicate document IDs', new Set([...document.querySelectorAll('[id]')].map(el => el.id)).size === document.querySelectorAll('[id]').length);
    $('slide-search').value = 'retrofit'; $('slide-search').dispatchEvent(new Event('input', { bubbles:true }));
    check('search filters matching slides', !sections.find(el => el.id === 's08').hidden && sections.some(el => el.hidden));
    $('slide-search').value = 'zzzznosuchstudysection'; $('slide-search').dispatchEvent(new Event('input', { bubbles:true }));
    check('search empty state', !$('search-empty').hidden && sections.every(el => el.hidden));
    $('clear-search').click(); check('clear restores every section', sections.every(el => !el.hidden));
    tabs.find(tab => tab.dataset.mode === 'flashcards').click(); check('flashcard tab opens', !$('flashcards-panel').hidden && $('study-panel').hidden);
    const front = $('flash-text').textContent; $('flash-card').click();
    check('flashcard flips', flipped && $('flash-text').textContent === DATA.flashcards[0].back);
    $('flash-next').click(); check('next card resets face', flashIndex === 1 && !flipped);
    $('flash-prev').click(); check('previous card', $('flash-text').textContent === front);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:' ', code:'Space', bubbles:true, cancelable:true })); check('Space flips card', flipped);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true, cancelable:true })); check('Right arrow advances card', flashIndex === 1 && !flipped);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', bubbles:true, cancelable:true })); check('Left arrow returns card', flashIndex === 0);
    const oldFlashOrder = flashOrder.join(','); $('flash-shuffle').click();
    check('shuffle keeps every flashcard once', flashOrder.length === DATA.counts.flashcards && new Set(flashOrder).size === DATA.counts.flashcards && flashOrder.join(',') !== oldFlashOrder);
    tabs.find(tab => tab.dataset.mode === 'qa').click(); check('Q&A tab opens with hidden answer', !$('qa-panel').hidden && $('qa-answer').hidden);
    $('qa-reveal').click(); check('Q&A answer reveals', !$('qa-answer').hidden && $('qa-answer').textContent === DATA.questions[qaOrder[qaIndex]].a);
    $('qa-next').click(); check('next Q&A hides previous answer', qaIndex === 1 && $('qa-answer').hidden);
    const oldQaOrder = qaOrder.join(','); $('qa-shuffle').click();
    check('Q&A shuffle retains every question', new Set(qaOrder).size === DATA.counts.questions && qaOrder.join(',') !== oldQaOrder);
    const sourceKey = DATA.questions[qaOrder[qaIndex]].key; $('qa-source').click();
    check('Q&A source link returns to its slide', mode === 'study' && location.hash === '#' + sourceKey);
    history.replaceState(null,'',location.href.split('#')[0]);
    tabs.find(tab => tab.dataset.mode === 'glossary').click(); check('complete glossary', $('glossary-panel').querySelectorAll('dt').length === DATA.counts.glossary);
    tabs.find(tab => tab.dataset.mode === 'day').click(); check('N27 table and checklist', document.querySelectorAll('.clicker-table tbody tr').length === 8 && document.querySelectorAll('[data-check]').length === 3);
    const checkbox = document.querySelector('[data-check]'), oldChecked = checkbox.checked; checkbox.click(); check('checklist is interactive', checkbox.checked !== oldChecked); checkbox.click();
    const oldTheme = document.documentElement.dataset.theme; $('theme-toggle').click(); check('theme switches', document.documentElement.dataset.theme !== oldTheme); $('theme-toggle').click();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true, cancelable:true })); check('tab arrow navigation', mode === 'flashcards');
    setMode(query.get('mode') || 'study', { scroll:false });
    if (query.get('slide')) jumpTo(query.get('slide')); else window.scrollTo(0,0);
    // Remove focus left by behavioral tests before a clean screenshot.
    document.activeElement?.blur();
    check('no horizontal document overflow', document.documentElement.scrollWidth <= innerWidth + 1);
    check('no prohibited dashes in page text', !/[\u2013\u2014]/.test(document.body.textContent));
    check('Montserrat font faces loaded', [...document.fonts].every(font => font.status === 'loaded'));
    check('no runtime or resource errors', errors.length === 0);
    const report = { ok:checks.every(item => item.ok), viewport:{ width:innerWidth, height:innerHeight }, capture:{ mode, slide:query.get('slide'), scrollY, height:document.documentElement.scrollHeight, target:query.get('slide') ? $(query.get('slide'))?.getBoundingClientRect().toJSON() : null }, counts:DATA.counts, checks, errors };
    const node = document.createElement('script'); node.type = 'application/json'; node.id = 'audit-result'; node.textContent = JSON.stringify(report); document.body.appendChild(node);
    window.__studyAudit = report;
    if (window.parent !== window) window.parent.postMessage({ type:'seoul-study-audit', report }, '*');
  }
  Promise.resolve(document.fonts.ready).then(() => {
    document.documentElement.dataset.studyReady = '1';
    if (query.has('audit')) return audit();
    else if (query.get('slide') || location.hash) jumpTo(query.get('slide') || location.hash.slice(1));
  }).catch(error => {
    errors.push(String(error));
    if (query.has('audit')) {
      const report = { ok:false, errors };
      const node = document.createElement('script'); node.id = 'audit-result'; node.type = 'application/json'; node.textContent = JSON.stringify(report); document.body.appendChild(node);
      if (window.parent !== window) window.parent.postMessage({ type:'seoul-study-audit', report }, '*');
    }
  });
}

const css = `
${fonts}
:root{color-scheme:light;--paper:#FFFFFF;--ink:#111112;--red:#CD2E3A;--blue:#0047A0;--muted:#6B6D70;--rule:#DBDAD7;--faint:#EDEDEA;--surface:#FFFFFF;--focus:#0047A0}
:root[data-theme=dark]{color-scheme:dark;--paper:#111112;--ink:#FFFFFF;--red:#F18B92;--blue:#8DB8F6;--muted:#B5B7BD;--rule:#3B3D42;--faint:#242529;--surface:#1C1D20;--focus:#8DB8F6}
*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:auto;scroll-padding-top:120px}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.7 Montserrat,sans-serif}button,input{font:inherit;color:inherit}button,a,input,summary{-webkit-tap-highlight-color:transparent}button,summary{cursor:pointer}button{border:1px solid var(--ink);background:var(--paper);padding:11px 16px;font-size:13px;font-weight:700;line-height:1.4;max-width:100%}button:hover{background:var(--faint)}button.primary{background:var(--ink);color:var(--paper)}button.primary:hover{background:var(--blue);border-color:var(--blue);color:var(--paper)}a{color:var(--blue);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}:focus-visible{outline:3px solid var(--focus);outline-offset:4px}[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.skip-link{position:fixed;top:-100px;left:16px;z-index:100;padding:12px 20px;background:var(--ink);color:var(--paper)}.skip-link:focus{top:12px}.site-header{position:sticky;top:0;z-index:20;background:var(--paper);border-bottom:1px solid var(--rule)}.header-inner{max-width:1560px;margin:auto;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px}.wordmark{font-size:14px;font-weight:900;letter-spacing:1.5px;margin:0;line-height:1.3}.wordmark span{display:block;color:var(--muted);font-weight:500;letter-spacing:0;font-size:11px;margin-top:5px}.header-actions{display:flex;align-items:center;gap:20px}.tabs{display:flex;flex-wrap:wrap;gap:6px}.tabs button{border-color:transparent;background:transparent;padding:10px 12px;font-weight:500}.tabs button[aria-selected=true]{font-weight:700;color:var(--blue);border-bottom-color:var(--blue)}#theme-toggle{font-size:12px}.layout{max-width:1560px;margin:auto;padding:32px;display:grid;grid-template-columns:264px minmax(0,1fr);gap:40px}.layout>*{min-width:0}.sidebar{position:sticky;top:112px;height:calc(100vh - 136px);align-self:start}.slide-menu{height:100%;display:flex;flex-direction:column}.slide-menu>summary{display:none}.index-heading{font-size:12px;font-weight:700;letter-spacing:1px;margin:0 0 12px}.search-label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}#slide-search{display:block;width:100%;min-width:0;background:var(--paper);border:1px solid var(--muted);border-radius:0;padding:11px 12px;font-size:14px}.search-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 16px;font-size:11px;color:var(--muted)}#clear-search{font-size:11px;padding:3px 8px;border-color:var(--muted)}.slide-index{overflow-y:auto;height:calc(100vh - 280px);padding:0 12px 16px 0;scrollbar-width:thin}.slide-nav{display:grid;grid-template-columns:1fr auto;column-gap:10px;row-gap:2px;text-decoration:none;color:var(--ink);padding:12px 12px;border-left:2px solid var(--rule);margin:2px 0}.slide-nav:hover{background:var(--faint)}.slide-nav[aria-current]{border-left-color:var(--red);background:var(--faint)}.nav-label{font-size:10px;line-height:1.3;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)}.nav-title{font-size:12px;line-height:1.5;grid-row:2}.slide-nav time{grid-column:2;grid-row:2;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}.slide-nav.kind-image{padding-top:7px;padding-bottom:7px}.slide-nav.kind-image .nav-title{font-size:11px;color:var(--muted)}.reading{max-width:1120px;min-width:0}h1,h2,h3,h4{line-height:1.2}h1{font-size:clamp(36px,3.5vw,52px);font-weight:900;letter-spacing:-1.5px;margin:8px 0 24px;max-width:24ch}h2{font-size:clamp(29px,2.8vw,40px);font-weight:900;letter-spacing:-.8px;margin:8px 0 16px}h3{font-size:18px;font-weight:700;margin:0 0 16px}h4{font-size:13px;font-weight:700;margin:0 0 12px}p{margin:0 0 16px;overflow-wrap:anywhere}li{padding-left:3px;margin:8px 0;overflow-wrap:anywhere}ul,ol{padding-left:22px;margin:0 0 16px}strong{font-weight:700}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;color:var(--muted);margin:0 0 8px}.intro-meta{font-size:12px;color:var(--muted);margin:0 0 24px}.thesis{font-size:18px;line-height:1.75;max-width:76ch}.five-things{padding:24px 0 8px;border-top:1px solid var(--rule);margin-top:24px}.five-things ol{display:grid;grid-template-columns:1fr 1fr;gap:8px 36px;padding-left:22px;font-size:14px;line-height:1.7}.five-things li{padding-left:5px;margin-bottom:12px}.five-things li::marker{font-weight:900;color:var(--red)}.run-of-show{margin:24px 0 48px;padding:24px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}.run-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:14px}.run-heading h3{margin:0}.run-heading span{font-size:12px;color:var(--muted)}.timeline{display:flex;height:42px;width:100%;overflow:hidden;background:var(--faint)}.run-segment{display:flex;align-items:center;justify-content:center;height:42px;min-width:0;flex-shrink:0;background:var(--ink);color:var(--paper);border-right:1px solid var(--paper);font-size:10px;text-decoration:none;overflow:hidden;font-weight:700}.run-segment.kind-image{background:var(--blue);border-top:6px solid var(--red)}.run-segment:hover{opacity:.7}.timeline-times{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:8px}.after-talk{font-size:12px;margin-top:12px;display:flex;flex-wrap:wrap;gap:6px 16px}.after-talk>span{color:var(--muted)}.helper{color:var(--muted);font-size:13px;line-height:1.6}.slide-section{border-top:2px solid var(--ink);padding-top:32px;margin:0 0 64px;scroll-margin-top:112px}.chapter-header{border-bottom:1px solid var(--rule);padding-bottom:24px;margin-bottom:24px}.time-window{font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted);margin:0}.one-sentence{font-size:19px;font-weight:500;line-height:1.7;margin-bottom:32px}.study-block{margin:32px 0}.study-block p,.study-block li{max-width:76ch}.slide-copy{background:var(--faint);padding:24px}.copy-group{padding:18px 0;border-top:1px solid var(--rule)}.copy-group:first-of-type{border-top:0;padding-top:4px}.copy-group:last-child{padding-bottom:0}.copy-group h4{color:var(--blue)}.copy-group ul{list-style:none;padding:0;margin:0;font-size:14px}.copy-group li{white-space:pre-line;padding:0;margin:6px 0}.presenter-notes{border-left:3px solid var(--blue);padding-left:24px}.presenter-notes>h3{color:var(--blue)}.presenter-notes p,.presenter-notes li{font-size:14px;line-height:1.8}.presenter-notes ul{margin-bottom:20px}.note-cue{margin:24px 0 12px;font-size:14px;line-height:1.6}.cue-time{font-variant-numeric:tabular-nums;color:var(--blue);margin-right:5px}.spoken-line{margin:20px 0;padding:16px 20px;background:var(--faint);border-left:3px solid var(--red);font-weight:700}.spoken-line p{margin:0;font-size:16px;line-height:1.7}.confidence-legend{font-size:12px;color:var(--muted);line-height:2}.confidence{display:inline-block;padding:3px 8px;border:1px solid var(--rule);font-size:10px;font-weight:700;letter-spacing:.3px;line-height:1.4;white-space:nowrap;background:var(--paper);color:var(--ink)}.confidence.solid{color:var(--blue)}.confidence.hedge{color:var(--red)}table{border-collapse:collapse;width:100%;text-align:left;font-size:13px;line-height:1.7;table-layout:fixed}th,td{border-bottom:1px solid var(--rule);padding:16px 12px;vertical-align:top;overflow-wrap:anywhere}thead th{font-size:11px;text-transform:uppercase;letter-spacing:.6px;background:var(--faint)}.numbers-table th:first-child{width:22%;font-size:15px}.numbers-table th:last-child{width:16%}.numbers-table td p{font-size:12px;margin:8px 0 0}.number-source{color:var(--muted)}.number-note{color:var(--ink)}.simple-explanation{border:1px solid var(--rule);padding:24px}.question{border-top:1px solid var(--rule);padding:16px 0}.question:last-child{border-bottom:1px solid var(--rule)}summary{font-weight:700;font-size:14px;line-height:1.7;padding:2px 24px 2px 0}.answer{padding:16px 0 0 20px}.answer p{font-size:14px}.cautions{border-left:3px solid var(--red);padding-left:24px}.cautions h3{color:var(--red)}.terms{margin:0}.terms>div{padding:12px 0;border-bottom:1px solid var(--rule)}dt{font-weight:700;font-size:14px}dd{margin:4px 0 0;font-size:14px;line-height:1.8;overflow-wrap:anywhere}.nyc-link{border-top:1px solid var(--rule);padding-top:24px}.nyc-link h3{color:var(--blue)}.kind-image.slide-section{border-top:1px solid var(--rule);padding:24px;background:var(--faint);margin:0 0 48px}.kind-image h2{font-size:23px;letter-spacing:-.3px}.kind-image .chapter-header{padding-bottom:16px;margin-bottom:20px}.kind-image .study-block{margin:20px 0 0}.kind-image p{font-size:13px;line-height:1.8}.kind-image h3{font-size:14px;margin-bottom:10px}.photo-pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}.seoul h3,.seoul p{color:var(--red)}.nyc h3,.nyc p{color:var(--blue)}.photo-notes{margin-top:16px;border-top:1px solid var(--rule);padding-top:12px}.photo-notes .presenter-notes{margin:16px 0}.kind-appendix h3{color:var(--blue)}.practice-heading{border-bottom:1px solid var(--rule);padding-bottom:16px;margin-bottom:24px}.practice-heading h1{margin-bottom:16px}.practice-heading p{font-size:14px;color:var(--muted);max-width:70ch}.practice-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}.practice-count{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;margin:0}.practice-card{display:block;text-align:left;width:100%;min-height:330px;padding:40px;background:var(--surface);border:1px solid var(--muted);font-weight:400;cursor:pointer}.practice-card:hover{background:var(--surface)}.card-face{display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--blue);font-weight:700;margin-bottom:24px}.card-text{display:block;font-size:27px;line-height:1.55;font-weight:500;overflow-wrap:anywhere}.practice-card[aria-pressed=true] .card-text{font-size:21px;line-height:1.8}.practice-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:20px 0}.keyboard-hint{font-size:12px;color:var(--muted);margin-top:20px}.qa-card{padding:32px;border:1px solid var(--muted);min-height:300px;background:var(--surface)}#qa-source{font-size:12px;display:inline-block;margin-bottom:24px;line-height:1.6}#qa-question{font-size:25px;font-weight:500;line-height:1.6;max-width:65ch}#qa-answer{font-size:16px;border-top:1px solid var(--rule);padding-top:24px;margin-top:24px;line-height:1.8}.glossary-list>div{padding:24px 0}.glossary-list dt{font-size:19px}.glossary-list dd{font-size:16px;max-width:76ch}.checklist{list-style:none;padding:0;margin:32px 0}.checklist li{padding:0;margin:0;border-bottom:1px solid var(--rule)}.checklist label{display:flex;align-items:flex-start;gap:14px;padding:18px 0;font-size:16px;cursor:pointer}.checklist input{width:20px;height:20px;flex-shrink:0;margin:3px 0 0;accent-color:var(--blue)}.clicker-table caption{text-align:left;font-size:20px;font-weight:700;padding:24px 0 16px}.clicker-table th:first-child{width:24%}.clicker-table th:nth-child(2){width:39%}.empty-state{padding:32px;border:1px solid var(--rule)}.site-footer{font-size:11px;line-height:1.7;color:var(--muted);border-top:1px solid var(--rule);padding-top:24px;margin-top:40px}
@media(min-width:1700px){.layout{gap:56px}}
@media(max-width:1200px){.layout{grid-template-columns:228px minmax(0,1fr);gap:28px;padding:28px 24px}.header-inner{padding:16px 24px;gap:16px}.header-actions{gap:12px}.tabs button{padding:10px 8px}.wordmark{font-size:12px}.five-things ol{grid-template-columns:1fr}}
@media(max-width:999px){html{scroll-padding-top:24px}.site-header{position:static}.header-inner{padding:20px 24px;display:block}.header-actions{margin-top:20px;justify-content:space-between;align-items:flex-start}.layout{display:block;padding:24px}.sidebar{position:static;height:auto;margin-bottom:32px}.slide-menu{display:block;height:auto;border-bottom:1px solid var(--rule);padding-bottom:16px}.slide-menu>summary{display:list-item;font-size:14px;padding:8px 0}.index-heading{display:none}.search-label{margin-top:16px}.slide-index{height:350px;padding-bottom:0}.reading{max-width:none}.slide-section{scroll-margin-top:24px}.five-things ol{grid-template-columns:1fr 1fr}.numbers-table th:last-child{width:18%}}
@media(max-width:600px){body{font-size:16px}.header-inner{padding:20px 16px}.header-actions{display:block}.tabs{gap:6px 4px}.tabs button{font-size:12px;padding:10px 8px}.header-actions>#theme-toggle{margin-top:16px;padding:8px 12px}.layout{padding:16px}.sidebar{margin-bottom:24px}.wordmark{font-size:13px}.wordmark span{font-size:11px}h1{font-size:36px;letter-spacing:-1px;max-width:100%;margin-bottom:20px}h2{font-size:30px;letter-spacing:-.6px}h3{font-size:18px}.thesis{font-size:16px}.intro-meta{font-size:12px}.five-things ol{display:block;font-size:14px;padding-left:20px}.five-things li{padding-left:5px;margin-bottom:18px}.run-heading{align-items:flex-start;flex-direction:column;gap:8px}.run-of-show{margin-bottom:32px}.run-segment{font-size:8px;height:36px}.timeline{height:36px}.slide-section{padding-top:24px;margin-bottom:48px}.chapter-header{padding-bottom:20px}.one-sentence{font-size:18px}.study-block{margin:28px 0}.slide-copy{padding:20px 16px}.presenter-notes{padding-left:16px}.spoken-line{padding:14px 16px}.spoken-line p{font-size:15px}.photo-pair{display:block}.photo-pair section+section{margin-top:20px}.kind-image.slide-section{padding:20px 16px}.kind-image .study-block{margin-top:16px}.cautions{padding-left:16px}.simple-explanation{padding:20px 16px}.numbers-table,.numbers-table tbody,.numbers-table tr,.numbers-table th,.numbers-table td,.clicker-table,.clicker-table tbody,.clicker-table tr,.clicker-table th,.clicker-table td{display:block;width:100%!important}.numbers-table thead,.clicker-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.numbers-table tr,.clicker-table tr{padding:16px 0;border-bottom:1px solid var(--rule)}.numbers-table th,.numbers-table td,.clicker-table th,.clicker-table td{border:0;padding:6px 0}.numbers-table th{font-size:18px}.clicker-table td::before{content:attr(data-label);display:block;font-size:11px;color:var(--muted);font-weight:700;margin-bottom:4px}.numbers-table td:last-child{padding-top:10px}.numbers-table td p{margin-top:10px}.practice-card{padding:24px;min-height:320px}.card-text{font-size:23px}.practice-card[aria-pressed=true] .card-text{font-size:18px}.practice-controls{gap:10px}.practice-controls button{flex:1 1 auto;font-size:12px;padding:11px 12px}.practice-toolbar button{font-size:12px;padding:9px 12px}.qa-card{padding:24px 20px;min-height:320px}#qa-question{font-size:22px}#qa-answer{font-size:15px}.keyboard-hint{font-size:11px}.glossary-list dt{font-size:18px}.glossary-list dd{font-size:15px}.time-window{font-size:12px}.confidence-legend{font-size:11px}}
@media print{.site-header,.sidebar,.practice-controls,.skip-link{display:none}.layout{display:block;padding:0}.reading{max-width:none}[role=tabpanel][hidden]{display:none!important}details>*{display:block}.slide-section{break-before:page}.study-block{break-inside:avoid}body{font-size:11pt;background:white;color:black}a{color:inherit}}
`;

const html = `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Seoul: The Carrot and the Stick | Study Guide</title><style>${css}</style></head><body>
<a class="skip-link" href="#main">Skip to study material</a>
<header class="site-header"><div class="header-inner"><p class="wordmark">SEOUL<span>The Carrot and the Stick · Study guide</span></p><div class="header-actions"><nav class="tabs" role="tablist" aria-label="Study modes">${[['study','Study'],['flashcards','Flashcards'],['qa','Q&A practice'],['glossary','Glossary'],['day','Day of']].map(([key,label]) => `<button id="tab-${key}" role="tab" aria-selected="${key === 'study'}" aria-controls="${key}-panel" data-mode="${key}" tabindex="${key === 'study' ? '0' : '-1'}">${esc(label)}</button>`).join('')}</nav><button id="theme-toggle" aria-pressed="false">Dark theme</button></div></div></header>
<div class="layout"><aside class="sidebar" aria-label="Slide navigation"><details id="slide-menu" class="slide-menu" open><summary>Slides and search</summary><p class="index-heading">THE PRESENTATION</p><label class="search-label" for="slide-search">Search the slides</label><input id="slide-search" type="search" placeholder="Try retrofit or Climate Card" autocomplete="off"><div class="search-meta"><span id="filter-count" role="status">${entries.length} sections</span><button id="clear-search" hidden>Clear</button></div><nav class="slide-index" aria-label="Every slide in presentation order">${nav}</nav></details></aside>
<main class="reading" id="main"><section id="study-panel" role="tabpanel" data-panel="study" aria-labelledby="tab-study"><div id="overview"><p class="eyebrow">Your complete study guide</p><h1>${esc(copyByKey.get('s01')?.headline || byKey.get('s01')?.title)}</h1><p class="intro-meta">${entries.filter(entry => entry.kind === 'content').length} content slides · ${entries.filter(entry => entry.kind === 'image').length} photo pairs · ${stamp(total)} talk · 5 minutes of questions</p><p class="thesis">${esc(extras.thesis)}</p><section class="five-things"><h3>Five things to remember</h3><ol>${extras.fiveThings.map(text => `<li>${esc(text)}</li>`).join('')}</ol></section><section class="run-of-show" id="run-of-show" data-total-seconds="${total}"><div class="run-heading"><h3>Run of show</h3><span>Click a segment to jump to its slide.</span></div><nav class="timeline" aria-label="Slides sized by speaking duration">${timeline}</nav><div class="timeline-times"><span>0:00</span><span>Content slides in ink · photo pairs in red and blue</span><span>${stamp(total)}</span></div><div class="after-talk"><span>After ${stamp(total)}:</span>${entries.filter(entry => entry.dur === 0).map(entry => `<a href="#${esc(entry.key)}">${esc(entry.title)}</a>`).join('')}</div></section></div><p class="empty-state" id="search-empty" hidden>No slides match this search. Clear the search or try another word.</p>${entries.map(slideSection).join('\n')}</section>
<section id="flashcards-panel" role="tabpanel" data-panel="flashcards" aria-labelledby="tab-flashcards" hidden><header class="practice-heading"><p class="eyebrow">Recall the key ideas</p><h1>Flashcards</h1><p>Flip a card to check your answer, then move to the next one.</p></header><div class="practice-toolbar"><p class="practice-count" id="flash-count" role="status"></p><button id="flash-shuffle">Shuffle cards</button></div><button class="practice-card" id="flash-card" aria-pressed="false"><span class="card-face" id="flash-face">Question</span><span class="card-text" id="flash-text"></span></button><div class="practice-controls"><button id="flash-prev">Previous</button><button class="primary" id="flash-flip">Show answer</button><button id="flash-next">Next</button></div><p class="keyboard-hint">Keyboard: Left and Right to move · Space to flip</p></section>
<section id="qa-panel" role="tabpanel" data-panel="qa" aria-labelledby="tab-qa" hidden><header class="practice-heading"><p class="eyebrow">Prepare for the discussion</p><h1>Q&A practice</h1><p>Every likely question from the study slides, shuffled. Say your answer before revealing the source answer.</p></header><div class="practice-toolbar"><p class="practice-count" id="qa-count" role="status"></p><button id="qa-shuffle">Shuffle questions</button></div><div class="qa-card"><a id="qa-source" href="#s01"></a><p id="qa-question"></p><div id="qa-answer" hidden></div></div><div class="practice-controls"><button id="qa-prev">Previous</button><button class="primary" id="qa-reveal" aria-controls="qa-answer" aria-expanded="false">Show answer</button><button id="qa-next">Next question</button></div></section>
<section id="glossary-panel" role="tabpanel" data-panel="glossary" aria-labelledby="tab-glossary" hidden><header class="practice-heading"><p class="eyebrow">Words behind the slides</p><h1>Glossary</h1><p>${extras.glossary.length} terms from the study material.</p></header><dl class="terms glossary-list">${extras.glossary.map(term => `<div><dt>${esc(term.term)}</dt><dd>${esc(term.definition)}</dd></div>`).join('')}</dl></section>
<section id="day-panel" role="tabpanel" data-panel="day" aria-labelledby="tab-day" hidden><header class="practice-heading"><p class="eyebrow">Before you present</p><h1>Day of</h1><p>Check the submission, projector and clicker before the talk.</p></header><ul class="checklist"><li><label><input type="checkbox" data-check="pdf"><span>Submit the PDF before presenting. The assignment requires it.</span></label></li><li><label><input type="checkbox" data-check="extend"><span>Press Win+P and choose Extend.</span></label></li><li><label><input type="checkbox" data-check="clicker"><span>Test the clicker.</span></label></li></ul>${clickerTable}</section>
<footer class="site-footer">Seoul: The Carrot and the Stick · Study guide<br>Works offline as one file. Slide links, practice modes and theme controls are built in.</footer></main></div>
<script id="study-data" type="application/json">${json(runtimeData)}</script><script>(${bootStudy.toString()})();</script>
</body></html>`;

if (/[\u2013\u2014]/.test(html)) throw new Error('The generated guide contains an em or en dash; check the visible source fields. No source wording was changed.');
for (const [file, content] of snapshots) if (fs.readFileSync(path.join(root, file),'utf8') !== content) throw new Error(`Input changed during build: ${file}. Run the build again.`);
fs.mkdirSync(outputDir, { recursive:true });
const outputFile = path.join(outputDir, 'Seoul-Study-Guide.html');
fs.writeFileSync(outputFile + '.tmp', html, 'utf8');
fs.renameSync(outputFile + '.tmp', outputFile);
const report = { output:outputFile, bytes:Buffer.byteLength(html), counts:runtimeData.counts, sourceKeys:study.slides.map(slide => slide.key), order:entries.map(entry => ({ key:entry.key, title:entry.title, start:entry.start, end:entry.end, duration:entry.dur })), inputHashes:Object.fromEntries([...snapshots].map(([file, text]) => [file,createHash('sha256').update(text).digest('hex')])) };
fs.writeFileSync(path.join(outputDir, 'build-report.json'), JSON.stringify(report,null,2) + '\n');
console.log(`Built ${outputFile}\n${entries.length} sections, ${study.slides.length} study keys, ${extras.flashcards.length} flashcards, ${questions.length} questions; talk ${stamp(total)}. ${Buffer.byteLength(html).toLocaleString('en-US')} bytes. No prohibited dashes.`);
