// presenter.js - the presenter view: the SAME file opened with ?view=presenter by the audience window
// (window.open on P or Shift+P, see screens.js). No server, no second HTML file.
//
// A follower: it never owns state. It renders the snapshots the audience window broadcasts (sync.js) and sends
// commands back. Layout: large live current slide; "Next: B3" / "Next slide: <title>" preview; speaker notes
// (markdown) whose "[m:ss] Bn" cue lines light up as the slide timer passes them and whose "quoted" lines (to be
// said word for word) stand out; slide timer elapsed / planned (amber in the last 15 s, red when over); total vs
// plan (ahead / behind); next auto-beat countdown; wall clock; a big PAUSED banner after going back; buttons
// Pause/Resume, Reset, Auto-beats, Black screen, Present on projector. Before the talk starts (until the first
// forward press) a short checklist replaces the next preview, including the PDF reminder the user asked for.
//
// bootPresenter(arg?) - data comes from arg.data, arg itself, or globalThis.__SEOUL_DECK_DATA__:
//   { slidesSpec, timing, images, imageBriefs, references, diagrams, notes? }
//   notes (optional, e.g. spec/notes-v2.json) overrides notesFor(): { key: markdown } or { key: { md } } or
//   { slides: [...] } or an array of { key, ... }; structured beats { beats: [{ id, cue, label, bullets, say }] }
//   are turned into markdown (see noteToMarkdown).
// Previews are two buildDeck(..., { view: 'presenter' }) instances (current + next). Keys go through input.js
// bindKeys(), so every shortcut behaves exactly as in the audience window and is forwarded to it.
// UI text added here never uses em or en dashes; text coming from data is cleaned the same way (undash).

import { buildDeck } from './slides.js';
import { createStore, slidesFromTiming } from './state.js';
import { bindKeys } from './input.js';
import { notesFor } from '../slides/notes.js';
import { createSync, actionCommand, hookCommand } from './sync.js';
import { watchScreens, showToast, audienceUrlFor, AUDIENCE_WINDOW, MESSAGES } from './screens.js';
import { planFromTiming, fmt } from './overlay-timer.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const DECK_TITLE = 'Seoul: The Carrot and the Stick';
const BACK_KEYS = new Set(['PageUp', 'ArrowLeft', 'ArrowUp', 'Backspace']);

const ARROW_R = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_L = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M20 12H6M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ------------------------------------------------------------------ small utils
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, '0');
const fmtMs = (ms) => fmt(Math.floor(Math.max(0, ms) / 1000));
function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function safe(fn, label) {
  try { return fn(); } catch (e) { console.error(`[presenter] ${label || 'error'}`, e); return undefined; }
}
const prefs = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/** No em or en dashes in anything this view shows: ranges become "to", spaced dashes become commas. */
export function undash(text) {
  return String(text ?? '')
    .replace(/(\[\d{1,2}:\d{2}\]\s*B\d+)\s*[\u2014\u2013-]\s*/g, '$1 ')
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/\s+[\u2014\u2013]\s+/g, ', ')
    .replace(/\s*\u2014\s*/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/,\s*,/g, ',');
}
/** Titles: "Seoul \u2014 The Carrot and the Stick" -> "Seoul: The Carrot and the Stick". */
export function undashTitle(text) {
  return String(text ?? '').replace(/\s*[\u2014\u2013]\s*/g, ': ').replace(/:\s*:/g, ':').trim();
}

// ------------------------------------------------------------------ markdown (notes)
const QO = '\u0002';
const QC = '\u0003';

function inline(text) {
  // a backslash escapes the next character (notesFor() escapes credit text this way)
  const escaped = [];
  let s = String(text ?? '').replace(/\\([\\`*_[\]()#+\-.!~>|{}"])/g, (_, c) => { escaped.push(c); return `\u0001${escaped.length - 1}\u0001`; });
  // "lines to say word for word": mark straight and curly quoted spans before escaping
  s = s.replace(/"([^"\n]+)"|“([^”\n]+)”/g, (m) => `${QO}${m}${QC}`);
  s = esc(s);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?![\w])/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="pv-md-link">$1</span>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => esc(escaped[Number(i)]));
  s = s.split(QO).join('<span class="pv-say">').split(QC).join('</span>');
  return s;
}

/** True when a line (bullet or paragraph) is a line to say: it opens with a quotation mark. */
const isSayLine = (t) => /^(\*\*|__|\*|_)?\s*["“]/.test(String(t || '').trim());

const CUE_RE = /^\s*(?:[-*+]\s+)?(\*\*|__)?\s*\[(\d{1,2}):(\d{2})\]\s*(B\d+)\b([\s\S]*)$/;

/** Parse a cue line "**[0:20] B2 trajectory** more text" -> { id, sec, label, rest } or null. */
export function matchCue(line) {
  const m = String(line || '').match(CUE_RE);
  if (!m) return null;
  const bold = m[1];
  const tail = m[5] || '';
  let head = tail;
  let rest = '';
  if (bold) {
    const close = tail.indexOf(bold);
    if (close >= 0) { head = tail.slice(0, close); rest = tail.slice(close + bold.length); }
  }
  const label = head.replace(/^\s*[\u2014\u2013\-:·|]+\s*/, '').replace(/\*\*|__/g, '').trim();
  return { id: m[4], sec: Number(m[2]) * 60 + Number(m[3]), label, rest: rest.replace(/^\s*[:\u2014\u2013-]?\s*/, '').trim() };
}

/** Beat labels from a note: { B2: 'trajectory', ... } */
function cueLabels(md) {
  const out = {};
  for (const line of String(md || '').split(/\r?\n/)) { const c = matchCue(line); if (c && c.label) out[c.id] = c.label; }
  return out;
}

export function renderMarkdown(mdIn, cuesByBeat) {
  const md = undash(mdIn);
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { ordered, items: [{ depth, html, n, say }] }
  let first = true;
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p${isSayLine(para[0]) ? ' class="is-say"' : ''}>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    out.push(`<${tag} class="pv-md-list">${list.items.map((it) => `<li class="d${it.depth}${it.say ? ' is-say' : ''}"${it.n != null ? ` value="${it.n}"` : ''}>${it.html}</li>`).join('')}</${tag}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const trimmed = line.trim();
    // header meta line "**1:30 · 4 beats · ends 6:00**"
    if (first && /^\*\*\s*\d+:\d{2}\s*·[^*]*\*\*$/.test(trimmed)) {
      out.push(`<div class="pv-md-meta">${inline(trimmed.replace(/^\*\*|\*\*$/g, ''))}</div>`);
      first = false;
      continue;
    }
    first = false;
    const cue = matchCue(line);
    if (cue) {
      flushPara(); flushList();
      const k = Number(cue.id.slice(1)) - 1;
      const sec = cuesByBeat && cuesByBeat[k] != null ? cuesByBeat[k] : cue.sec;
      out.push(
        `<div class="pv-cue" data-k="${k}" data-sec="${sec}">`
        + `<span class="pv-cue-time">${fmt(sec)}</span><span class="pv-cue-id">${esc(cue.id)}</span>`
        + `<span class="pv-cue-label">${inline(cue.label)}</span>`
        + (cue.rest ? `<span class="pv-cue-rest">${inline(cue.rest)}</span>` : '')
        + '</div>',
      );
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h4 class="pv-md-h">${inline(m[2])}</h4>`); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    if ((m = line.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const ordered = /\d/.test(m[2]);
      const depth = clamp(Math.floor(m[1].replace(/\t/g, '  ').length / 2), 0, 3);
      if (list && list.ordered !== ordered && depth === 0) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push({ depth, html: inline(m[3]), n: ordered ? parseInt(m[2], 10) : null, say: isSayLine(m[3]) });
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote${isSayLine(m[1]) ? ' class="is-say"' : ''}>${inline(m[1])}</blockquote>`); continue; }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1].html += ` ${inline(trimmed)}`; continue; }
    flushList();
    para.push(trimmed);
  }
  flushPara(); flushList();
  return out.join('');
}

// ------------------------------------------------------------------ notes source (notes.js or notes-v2)
function notesMapOf(src) {
  if (!src || typeof src !== 'object') return null;
  const fromList = (arr) => {
    const o = {};
    for (const r of arr) if (r && typeof r === 'object' && typeof r.key === 'string') o[r.key] = r;
    return o;
  };
  if (Array.isArray(src)) return fromList(src);
  if (Array.isArray(src.slides)) return fromList(src.slides);
  if (src.slides && typeof src.slides === 'object') return src.slides;
  if (src.notes && typeof src.notes === 'object' && !Array.isArray(src.notes)) return src.notes;
  return src;
}

const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []);
const quoted = (t) => { const s = String(t).trim(); return /^["“]/.test(s) ? s : `"${s}"`; };

/** One note value (string, { md }, or structured beats) -> markdown, or null when unusable. */
export function noteToMarkdown(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').map((x) => `- ${x}`).join('\n');
  if (typeof v !== 'object') return null;
  for (const k of ['md', 'markdown', 'notes', 'text', 'body']) if (typeof v[k] === 'string') return v[k];
  const lines = [];
  const pushItems = (o) => {
    for (const b of asList(o.bullets || o.remind || o.reminders || o.points)) lines.push(`- ${b}`);
    for (const q of asList(o.say || o.quotes || o.lines || o.script)) lines.push(`- ${quoted(q)}`);
  };
  if (typeof v.remark === 'string') lines.push(`*${v.remark}*`, '');
  pushItems(v);
  for (const [k, b] of (Array.isArray(v.beats) ? v.beats : []).entries()) {
    if (!b || typeof b !== 'object') continue;
    const id = b.id || `B${k + 1}`;
    const cue = Number(b.cue) || 0;
    const label = b.label || b.title || '';
    if (lines.length) lines.push('');
    lines.push(`**[${fmt(cue)}] ${id}${label ? ` ${label}` : ''}**`);
    pushItems(b);
  }
  return lines.length ? lines.join('\n') : null;
}

// ------------------------------------------------------------------ deck metadata
function makeMeta(timing, images, noteOf, slidesSpec) {
  const order = (timing && timing.order) || [];
  const plan = planFromTiming(timing);
  const pairs = (images && images.pairs) || [];
  const specNotes = {};
  for (const s of (slidesSpec && slidesSpec.slides) || []) if (s && s.key) specNotes[s.key] = s.notes || '';
  const contentCount = order.filter((s) => s.kind === 'content').length;
  const rows = order.map((s, i) => {
    const pair = pairs.find((p) => p && (p.id === s.key || (s.after != null && p.after === s.after))) || null;
    const md = safe(() => noteOf(s.key), 'notes') || specNotes[s.key] || '';
    const beats = (s.beats && s.beats.length ? s.beats : [{ id: 'B1', cue: 0 }])
      .map((b, k) => ({ id: b.id || `B${k + 1}`, cue: Number(b.cue) || 0, show: b.show || [] }));
    const labels = cueLabels(undash(md));
    const plainTitle = undashTitle(s.title || '');
    let title;
    if (s.kind === 'content') title = `${pad2(s.n)}  ${plainTitle}`.trim();
    else if (s.kind === 'image') title = pair && pair.theme ? `Seoul / New York · ${undashTitle(pair.theme)}` : 'Seoul / New York images';
    else title = plainTitle || 'Appendix';
    return {
      i, key: s.key, kind: s.kind, n: s.n, after: s.after, plainTitle, title, md, pair,
      dur: Number(s.dur) || 0, start: plan.rows[i] ? plan.rows[i].start : 0,
      beats: beats.map((b) => {
        const fromShow = undash((b.show[0] || '').replace(/^B\d+\s*·\s*/, ''));
        return { ...b, label: labels[b.id] || (s.kind === 'image' ? (b.id === 'B1' ? 'Seoul' : 'New York') : fromShow) };
      }),
    };
  });
  return { rows, plan, contentCount, count: rows.length };
}

function positionText(row, meta) {
  if (!row) return '';
  if (row.kind === 'content') return `Slide ${pad2(row.n)} of ${meta.contentCount}`;
  if (row.kind === 'image') return `Photos after slide ${pad2(row.after ?? '')}`.trim();
  return 'Appendix';
}

// ------------------------------------------------------------------ preview (scaled buildDeck)
function createPreview(frame, data, label) {
  const scr = h('div', 'pv-screen');
  const stage = h('div', 'stage pv-stage');
  stage.setAttribute('aria-label', label);
  Object.assign(stage.style, {
    position: 'absolute', left: '0', top: '0', width: `${STAGE_W}px`, height: `${STAGE_H}px`,
    transformOrigin: '0 0', margin: '0', overflow: 'hidden', background: '#FFFFFF',
  });
  const endCard = h('div', 'pv-endcard', '<span>End of the deck</span>');
  scr.append(stage, endCard);
  frame.appendChild(scr);

  let deck = null;
  let scale = 0.3;
  try {
    deck = buildDeck(stage, {
      slidesSpec: data.slidesSpec, timing: data.timing, images: data.images || null,
      imageBriefs: data.imageBriefs || null, references: data.references || null, copy: data.copy || null,
      diagrams: data.diagrams || {}, view: 'presenter', getScale: () => scale, prefetch: 0,
    });
  } catch (e) {
    const failed = String((e && e.message) || e);
    console.error('[presenter] buildDeck failed', e);
    stage.innerHTML = `<div class="pv-deck-error">Slide preview unavailable<br><small>${esc(failed)}</small></div>`;
  }

  const fit = () => {
    const r = frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / STAGE_W, r.height / STAGE_H);
    scale = s;
    const w = Math.round(STAGE_W * s);
    const hh = Math.round(STAGE_H * s);
    const left = frame.dataset.align === 'start' ? 0 : Math.round((r.width - w) / 2);
    Object.assign(scr.style, { left: `${left}px`, top: '0px', width: `${w}px`, height: `${hh}px` });
    stage.style.transform = `scale(${s})`;
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(frame); else window.addEventListener('resize', fit);
  fit();

  let shown = { i: -1, b: -1 };
  return {
    screen: scr, stage, fit,
    show(i, beatsVisible, opts = {}) {
      endCard.classList.toggle('is-on', i == null);
      if (i == null || !deck) return;
      if (shown.i === i && shown.b === beatsVisible && !opts.force) return;
      shown = { i, b: beatsVisible };
      safe(() => deck.show(i, beatsVisible, { instant: opts.instant !== false }), 'show');
    },
    dispose() { if (ro) ro.disconnect(); safe(() => deck && deck.dispose(), 'dispose'); },
  };
}

// ------------------------------------------------------------------ DOM
const KB = (k) => `<kbd class="pv-kbd">${k}</kbd>`;
const KBI = (svg, name) => `<kbd class="pv-kbd pv-kbd--icon" aria-label="${name}">${svg}</kbd>`;

function buildDom() {
  document.documentElement.classList.add('pv-root');
  if (!document.body.dataset.view) document.body.dataset.view = 'presenter';
  const root = h('div', 'pv is-start');
  root.innerHTML = `
<header class="pv-top">
  <div class="pv-conn" data-state="wait"><span class="pv-dot"></span><span class="pv-conn-text">Waiting for the slides window</span></div>
  <div class="pv-deck">${esc(DECK_TITLE)}</div>
  <div class="pv-pos"></div>
  <div class="pv-proj" data-state="none"><span class="pv-proj-dot"></span><span class="pv-proj-text">One screen</span></div>
  <div class="pv-clock" aria-label="Wall clock"></div>
</header>
<main class="pv-main">
  <section class="pv-left">
    <div class="pv-row">
      <span class="pv-tag">Now</span><span class="pv-cur-title"></span>
      <span class="pv-beats" aria-label="Beats"></span>
    </div>
    <div class="pv-frame pv-frame--cur">
      <div class="pv-banner" data-kind="none" role="status" aria-live="polite">
        <div class="pv-banner-main"></div><div class="pv-banner-sub"></div>
        <button type="button" class="pv-btn pv-btn--primary pv-banner-btn" data-act="open-slides" hidden>Open the slides window</button>
      </div>
    </div>
    <div class="pv-timers">
      <div class="pv-tile pv-tile--slide" data-state="ok">
        <div class="pv-k">This slide</div>
        <div class="pv-big"><span class="pv-big-v">0:00</span><span class="pv-big-of">/ 0:00</span></div>
        <div class="pv-sbar"><div class="pv-sbar-fill"></div><div class="pv-sbar-ticks"></div></div>
      </div>
      <div class="pv-tile pv-tile--total">
        <div class="pv-k">Total</div>
        <div class="pv-mid"><span class="pv-mid-v">0:00</span><span class="pv-mid-of">/ 0:00</span></div>
        <div class="pv-delta" data-state="none">Not started</div>
      </div>
      <div class="pv-tile pv-tile--beat">
        <div class="pv-k">Next auto-beat</div>
        <div class="pv-mid pv-beat-v">Off</div>
        <div class="pv-beat-sub"></div>
      </div>
    </div>
  </section>
  <aside class="pv-right">
    <section class="pv-start" aria-label="Before you start">
      <div class="pv-start-head">
        <span class="pv-tag pv-tag--start">Before you start</span>
        <button type="button" class="pv-mini" data-act="start-hide">Hide</button>
      </div>
      <ol class="pv-check">
        <li data-item="projector" data-state="todo"><span class="pv-check-box">${CHECK}</span><div class="pv-check-txt"><div class="pv-check-t">Projector connected and set to Extend</div><div class="pv-check-s"></div></div></li>
        <li data-item="present" data-state="todo"><span class="pv-check-box">${CHECK}</span><div class="pv-check-txt"><div class="pv-check-t">Press ${KB('P')} to present on the projector</div><div class="pv-check-s"></div></div></li>
        <li data-item="clicker" data-state="todo" role="button" tabindex="-1"><span class="pv-check-box">${CHECK}</span><div class="pv-check-txt"><div class="pv-check-t">Test the clicker</div><div class="pv-check-s"></div></div></li>
        <li data-item="pdf" data-state="todo" class="is-key" role="checkbox" aria-checked="false" tabindex="-1"><span class="pv-check-box">${CHECK}</span><div class="pv-check-txt"><div class="pv-check-t">Submit the PDF of the presentation (the assignment requires it)</div><div class="pv-check-s"></div></div></li>
      </ol>
      <div class="pv-start-foot">Press ${KBI(ARROW_R, 'Right arrow')} or the clicker to begin. This list closes on the first forward press.</div>
    </section>
    <div class="pv-row pv-row--next"><span class="pv-tag pv-tag--next">Next</span><span class="pv-next-label"><span class="pv-next-main"></span><span class="pv-next-sub"></span></span></div>
    <div class="pv-frame pv-frame--next" data-align="center"></div>
    <div class="pv-row pv-row--notes">
      <span class="pv-tag pv-tag--notes">Notes</span>
      <span class="pv-notes-legend"><span class="pv-say">"Quoted"</span> = say it word for word</span>
      <span class="pv-notes-tools">
        <button type="button" class="pv-mini" data-act="font-" aria-label="Smaller notes">A−</button>
        <button type="button" class="pv-mini" data-act="font+" aria-label="Larger notes">A+</button>
      </span>
    </div>
    <div class="pv-notes" tabindex="0" aria-label="Speaker notes"><div class="pv-notes-body"></div></div>
  </aside>
</main>
<footer class="pv-controls">
  <div class="pv-group">
    <button type="button" class="pv-btn" data-act="prev" title="Back (Left arrow)">${ARROW_L}<span>Back</span></button>
    <button type="button" class="pv-btn pv-btn--primary" data-act="next" title="Next (Right arrow, Space, Enter)"><span>Next</span>${ARROW_R}</button>
  </div>
  <div class="pv-group">
    <button type="button" class="pv-btn" data-act="timer" aria-pressed="false" title="Pause or resume the timer (T)"><span class="pv-btn-t">Start timer</span>${KB('T')}</button>
    <button type="button" class="pv-btn" data-act="reset" title="Reset every timer (Shift+T)"><span class="pv-btn-t">Reset</span></button>
    <button type="button" class="pv-btn" data-act="auto" aria-pressed="true" title="Auto-beats on or off (A)"><span class="pv-btn-t">Auto-beats on</span>${KB('A')}</button>
    <button type="button" class="pv-btn" data-act="black" aria-pressed="false" title="Black screen (B)"><span class="pv-btn-t">Black screen</span>${KB('B')}</button>
  </div>
  <div class="pv-group pv-group--end">
    <button type="button" class="pv-btn pv-btn--present" data-act="present" aria-pressed="false" title="Present on the projector (P)"><span class="pv-btn-t">Present on projector</span>${KB('P')}</button>
    <button type="button" class="pv-btn pv-btn--ghost" data-act="help" title="Keyboard shortcuts (?)">${KB('?')}</button>
  </div>
</footer>
<div class="pv-help" hidden>
  <div class="pv-help-card" role="dialog" aria-label="Keyboard shortcuts">
    <div class="pv-help-title">Keyboard</div>
    <dl>
      <dt>${KBI(ARROW_R, 'Right arrow')} Space Enter PgDn</dt><dd>Next beat or next slide. After going back, the first press only resumes the timer.</dd>
      <dt>${KBI(ARROW_L, 'Left arrow')} PgUp Backspace</dt><dd>Back. Leaving a slide backwards pauses the timer.</dd>
      <dt>Shift+${KBI(ARROW_R, 'Right arrow')} &nbsp;${KB('N')}</dt><dd>Skip the remaining beats, go to the next slide</dd>
      <dt>${KB('T')} / Shift+${KB('T')}</dt><dd>Pause or resume the timer / reset it</dd>
      <dt>${KB('A')}</dt><dd>Auto-beats on or off</dd>
      <dt>${KB('B')} ${KB('W')}</dt><dd>Black or white audience screen</dd>
      <dt>${KB('G')} number Enter</dt><dd>Go to slide number</dd>
      <dt>${KB('P')} ${KB('F')}</dt><dd>Present on the projector / fullscreen the slides</dd>
      <dt>${KB('O')}</dt><dd>On-slide timer on the audience screen</dd>
      <dt>Win+P</dt><dd>Windows display mode: choose Extend to keep this view on the laptop</dd>
      <dt>Home End</dt><dd>First or last slide</dd>
    </dl>
    <div class="pv-help-foot">Press ${KB('?')} or Esc to close</div>
  </div>
</div>
<div class="pv-goto" hidden><span class="pv-goto-k">Go to slide</span><span class="pv-goto-v"></span></div>`;
  document.body.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  return {
    root, $,
    conn: $('.pv-conn'), connText: $('.pv-conn-text'), pos: $('.pv-pos'), proj: $('.pv-proj'), projText: $('.pv-proj-text'), clock: $('.pv-clock'),
    curTitle: $('.pv-cur-title'), beats: $('.pv-beats'), curFrame: $('.pv-frame--cur'), banner: $('.pv-banner'),
    bannerMain: $('.pv-banner-main'), bannerSub: $('.pv-banner-sub'), bannerBtn: $('.pv-banner-btn'),
    slideTile: $('.pv-tile--slide'), slideV: $('.pv-big-v'), slideOf: $('.pv-big-of'), sbarFill: $('.pv-sbar-fill'), sbarTicks: $('.pv-sbar-ticks'),
    totalV: $('.pv-mid-v'), totalOf: $('.pv-mid-of'), delta: $('.pv-delta'),
    beatV: $('.pv-beat-v'), beatSub: $('.pv-beat-sub'), beatTile: $('.pv-tile--beat'),
    start: $('.pv-start'), check: (id) => $(`.pv-check [data-item="${id}"]`),
    nextMain: $('.pv-next-main'), nextSub: $('.pv-next-sub'), nextFrame: $('.pv-frame--next'),
    notes: $('.pv-notes'), notesBody: $('.pv-notes-body'),
    btnTimer: $('[data-act="timer"]'), btnReset: $('[data-act="reset"]'), btnAuto: $('[data-act="auto"]'), btnBlack: $('[data-act="black"]'),
    btnPresent: $('[data-act="present"]'), help: $('.pv-help'), gotoBox: $('.pv-goto'), gotoV: $('.pv-goto-v'),
  };
}

// ------------------------------------------------------------------ boot
export function bootPresenter(arg = {}) {
  const given = arg && typeof arg === 'object' && arg.data && typeof arg.data === 'object' ? arg.data : (arg || {});
  const data = Object.assign({}, globalThis.__SEOUL_DECK_DATA__ || {}, given);
  const { timing } = data;
  if (!timing || !Array.isArray(timing.order)) throw new Error('bootPresenter: data.timing (spec/timing.json) is required');
  const noteMap = notesMapOf(data.notes || data.notesV2 || null);
  const noteOf = (key) => {
    const v = noteMap ? noteToMarkdown(noteMap[key]) : null;
    return v != null && v !== '' ? v : notesFor(key, data.images);
  };
  const meta = makeMeta(timing, data.images, noteOf, data.slidesSpec);
  const params = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } })();
  document.title = 'Presenter: Seoul';

  const ui = buildDom();
  const cur = createPreview(ui.curFrame, data, 'Current slide');
  const nxt = createPreview(ui.nextFrame, data, 'Next preview');
  cur.screen.appendChild(ui.banner); // the banner sits on the slide image itself

  // ---------------- state
  let snap = null; // last store snapshot
  let snapUi = {}; // ui extras from the audience window (screens.js controller.uiState() + audience extras)
  let snapAt = Date.now(); // leader clock (same machine) when snap was taken
  let live = false; // leader connected
  let demo = false; // rendering a local (URL) state, not the leader's
  let renderedKey = null;
  let lastCueMark = '';
  let userScrollAt = 0;
  let fontScale = clamp(Number(prefs.get('seoul-deck/notesScale', 1)) || 1, 0.7, 1.6);
  let presentHintTimer = 0;
  let screenInfo = { extended: false, count: 1 };
  let startHidden = false;
  let clickerTested = false;
  let firstKeySeq = null;
  let lastMode = '';
  let dragToast = null;
  const pdfDay = prefs.get('seoul-deck/pdfSubmitted', null);
  let pdfDone = pdfDay === today();

  const applyFont = () => ui.root.style.setProperty('--pv-notes-scale', String(fontScale));
  applyFont();

  // ---------------- local state for idle / URL demo (?slide=s07&beat=1&slideSec=50&globalSec=400&paused=back)
  function localSnapshot() {
    const slides = slidesFromTiming(timing);
    const t = 0;
    const st = createStore({ slides, now: () => t });
    const key = params.get('slide');
    if (!key) return st.getState();
    // ?slide= accepts a key (s07, i03, refs) or a content-slide number (7); ?beat= is the 0-based beat
    const idx = /^\d+$/.test(key) ? slides.findIndex((s) => s.n === Number(key)) : slides.findIndex((s) => s.key === key);
    if (idx < 0) return st.getState();
    const beat = Number(params.get('beat') || 0);
    const s0 = st.dispatch({ type: 'jump', index: idx, beat: Number.isFinite(beat) ? Math.max(0, Math.floor(beat)) : 0 });
    const slideSec = Number(params.get('slideSec') || 0);
    const globalSec = Number(params.get('globalSec') || (meta.rows[idx] ? meta.rows[idx].start + slideSec : 0));
    const paused = params.get('paused') || 'none';
    const furthestKey = params.get('furthest');
    const furthest = furthestKey ? Math.max(idx, slides.findIndex((s) => s.key === furthestKey)) : idx;
    const slideMs = slides.map((s, i) => (i < idx ? s.dur * 1000 : 0));
    slideMs[idx] = slideSec * 1000;
    const running = paused === 'none' && (slideSec > 0 || globalSec > 0);
    const { beatOffsetMs: _stale, ...base } = s0; // re-anchor the auto-beat schedule on the restored slide time
    st.dispatch({
      type: 'restore',
      state: {
        ...base, furthest, started: slideSec > 0 || globalSec > 0,
        timer: { running, pausedByBack: paused === 'back', globalMs: globalSec * 1000, slideMs },
        autoBeats: params.get('auto') !== '0',
        black: params.get('black') === '1',
      },
    });
    return st.getState();
  }

  // ---------------- commands
  let sync = null;
  const notConnected = () => showToast('Not connected to the slides window. Press <kbd>Shift</kbd>+<kbd>P</kbd> in the slides window, or use Open the slides window.', { ms: 6000, level: 'warn' });
  const send = (cmd, opts) => {
    if (!sync) return false;
    const ok = sync.send(cmd, opts);
    if (!live) notConnected();
    return ok;
  };
  const act = (type, payload) => {
    if (type === 'prev' || type === 'prevSlide') markClicker();
    return send(actionCommand(type, payload));
  };

  function present() {
    send(hookCommand('present'), { delegate: 'fullscreen' });
    clearTimeout(presentHintTimer);
    presentHintTimer = setTimeout(() => {
      if (live && !snapUi.presenting && snapUi.mode !== 'fallback') {
        showToast('If the slides did not move to the projector, click the slides window and press <kbd>P</kbd> there.', { ms: 9000 });
      }
    }, 2500);
  }

  function openSlides() {
    let w = null;
    try { w = window.open(audienceUrlFor(), AUDIENCE_WINDOW); } catch { w = null; }
    if (w) { try { sync.attach(w); } catch { /* ignore */ } }
    else showToast('Pop-up blocked. Allow pop-ups for this page, or open the presentation file again.', { ms: 8000, level: 'warn' });
  }

  function markClicker() {
    if (clickerTested) return;
    clickerTested = true;
    renderStart();
  }

  // ---------------- buttons
  let resetArmedUntil = 0;
  const setResetLabel = (b, armed) => {
    b.classList.toggle('is-armed', armed);
    b.querySelector('.pv-btn-t').textContent = armed ? 'Click again to reset' : 'Reset';
  };
  ui.root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-item]');
    if (!b) return;
    if (b.dataset.item) {
      if (b.dataset.item === 'pdf') {
        pdfDone = !pdfDone;
        prefs.set('seoul-deck/pdfSubmitted', pdfDone ? today() : null);
      } else if (b.dataset.item === 'clicker') {
        clickerTested = !clickerTested;
      }
      renderStart();
      return;
    }
    const a = b.dataset.act;
    if (a === 'next') act('next');
    else if (a === 'prev') act('prev');
    else if (a === 'timer') act('toggleTimer');
    else if (a === 'reset') {
      if (Date.now() < resetArmedUntil) { resetArmedUntil = 0; act('resetTimer'); setResetLabel(b, false); }
      else {
        resetArmedUntil = Date.now() + 3000;
        setResetLabel(b, true);
        setTimeout(() => { if (Date.now() >= resetArmedUntil) setResetLabel(b, false); }, 3100);
      }
    } else if (a === 'auto') act('toggleAutoBeats');
    else if (a === 'black') act('black');
    else if (a === 'present') present();
    else if (a === 'open-slides') openSlides();
    else if (a === 'help') toggleHelp();
    else if (a === 'start-hide') { startHidden = true; renderStart(); }
    else if (a === 'font-' || a === 'font+') {
      fontScale = clamp(Math.round((fontScale + (a === 'font+' ? 0.1 : -0.1)) * 10) / 10, 0.7, 1.6);
      prefs.set('seoul-deck/notesScale', fontScale);
      applyFont();
    }
    if (b.tagName === 'BUTTON') b.blur(); // keep Space / Enter for navigation, not for re-clicking
  });

  // ---------------- help + go-to prompt
  function toggleHelp(force) {
    const open = force !== undefined ? force : ui.help.hidden;
    ui.help.hidden = !open;
  }
  ui.help.addEventListener('click', (e) => { if (e.target === ui.help) toggleHelp(false); });

  const gotoShow = (text) => { ui.gotoBox.hidden = text == null; ui.gotoV.textContent = text || '_'; };

  // ---------------- keys: the deck's own key map (input.js); actions are forwarded to the slides window
  // While the help card is open it owns the keyboard (capture phase runs before bindKeys).
  window.addEventListener('keydown', (e) => {
    if (BACK_KEYS.has(e.key) && !e.repeat) markClicker();
    if (ui.help.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' || e.key === 'Esc' || e.key === '?' || (e.code === 'Slash' && e.shiftKey)) toggleHelp(false);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  bindKeys(window, (action) => {
    if (!action || !action.type) return;
    const { type, ...payload } = action;
    act(type, payload);
  }, {
    present: () => present(),
    openPresenter: () => { try { window.focus(); } catch { /* ignore */ } },
    fullscreen: () => send(hookCommand('fullscreen'), { delegate: 'fullscreen' }),
    help: () => toggleHelp(true),
    escape: () => { toggleHelp(false); gotoShow(null); },
    gotoPrompt: (text) => gotoShow(text),
  });

  // notes: remember manual scrolling so auto-scroll does not fight the speaker
  const markUser = () => { userScrollAt = Date.now(); };
  ui.notes.addEventListener('wheel', markUser, { passive: true });
  ui.notes.addEventListener('touchmove', markUser, { passive: true });
  ui.notes.addEventListener('pointerdown', markUser);

  // ---------------- screens (status chip + checklist). The audience window runs the present flow and sends the
  // "Projector detected" / "disconnected" notices, so this window shows no detection toast of its own.
  safe(() => watchScreens((info) => {
    screenInfo = info;
    renderStatus();
    renderStart();
  }), 'watchScreens');

  // ---------------- sync
  sync = createSync({
    role: 'presenter',
    onState(state, m) {
      if (!state || typeof state !== 'object') return;
      snap = state;
      snapUi = (m && m.ui) || {};
      snapAt = (m && (m.sentAt || m.receivedAt)) || Date.now();
      demo = false;
      onUi();
      render();
    },
    onLeader(alive) { live = alive; renderStatus(); render(); },
    onNotice(n) { if (n && n.text) showToast(n.text, { ms: n.ms || 6000, level: n.level || 'info' }); },
    onControl(c) {
      if (c && c.type === 'place' && c.rect) {
        const r = c.rect;
        try { if (r.width > 200 && r.height > 200) { window.moveTo(r.left, r.top); window.resizeTo(r.width, r.height); } } catch { /* not a popup: fine */ }
      }
    },
  });

  function onUi() {
    const mode = snapUi.mode || '';
    if (mode !== lastMode) {
      if (mode === 'fallback' && !snapUi.presenting) dragToast = showToast(MESSAGES.dragPresenter, { ms: 15000 });
      lastMode = mode;
    }
    if (snapUi.presenting && dragToast) { dragToast.close(); dragToast = null; }
    if (typeof snapUi.keySeq === 'number') {
      if (firstKeySeq === null) firstKeySeq = snapUi.keySeq;
      else if (snapUi.keySeq !== firstKeySeq && BACK_KEYS.has(snapUi.lastKey)) markClicker();
    }
    if (snapUi.clickerTested) markClicker();
  }

  // ---------------- derived values
  const row = (i) => meta.rows[i] || null;
  const beatsOf = (i) => (row(i) ? row(i).beats.length : 1);
  const isStartPhase = (st) => !!st && !((st.furthest | 0) > 0 || (st.furthestBeat | 0) > 0);
  // Both windows see the same screens; the leader's view wins while connected (it runs the present flow).
  const extendedNow = () => (live && snapUi.screens ? !!snapUi.screens.extended : !!screenInfo.extended);

  function liveTimes(st) {
    const t = st.timer || {};
    const running = !!t.running && (live || demo);
    const dt = running ? clamp(Date.now() - snapAt, 0, 4000) : 0;
    const i = st.cur | 0;
    const slideMs = ((t.slideMs && t.slideMs[i]) || 0) + dt;
    const globalMs = (t.globalMs || 0) + dt;
    const furthest = st.furthest ?? i;
    const fSlideMs = ((t.slideMs && t.slideMs[furthest]) || 0) + (furthest === i ? dt : 0);
    return { running, dt, slideMs, globalMs, furthest, fSlideMs };
  }

  function nextTarget(st) {
    if (st.next !== undefined) return st.next;
    const i = st.cur | 0;
    const b = st.beat | 0;
    if (b < beatsOf(i) - 1) return { kind: 'beat', index: i, beat: b + 1, beatsVisible: b + 2 };
    if (i < meta.count - 1) { const j = i + 1; const bv = j < (st.furthest ?? i) ? beatsOf(j) : 1; return { kind: 'slide', index: j, beat: bv - 1, beatsVisible: bv }; }
    return null;
  }

  // ---------------- render (state-dependent, on every snapshot)
  function render() {
    const st = snap;
    if (!st) return;
    const i = st.cur | 0;
    const r = row(i);
    const bv = st.beatsVisible ?? ((st.beat | 0) + 1);

    // current slide (forward builds animate like the audience; jumps / back are instant)
    const nav = st.nav || {};
    cur.show(i, bv, { instant: renderedKey === null || nav.instant !== false });

    // next preview
    const nx = nextTarget(st);
    nxt.show(nx ? nx.index : null, nx ? nx.beatsVisible : 0, { instant: true });
    renderNext(st, nx);

    // header / title / notes
    if (r && renderedKey !== r.key) {
      ui.curTitle.textContent = r.title;
      ui.pos.textContent = `${positionText(r, meta)}  ·  ${i + 1} / ${meta.count}`;
      renderNotes(r);
      renderTicks(r);
      renderedKey = r.key;
      lastCueMark = '';
    }
    renderBeats(st, r);

    // buttons
    const running = !!(st.timer && st.timer.running);
    setBtn(ui.btnTimer, running ? 'Pause' : (st.started ? 'Resume' : 'Start timer'), running);
    ui.btnAuto.setAttribute('aria-pressed', String(!!st.autoBeats));
    setText(ui.btnAuto.querySelector('.pv-btn-t'), st.autoBeats ? 'Auto-beats on' : 'Auto-beats off');
    ui.btnBlack.setAttribute('aria-pressed', String(!!st.black));
    setText(ui.btnBlack.querySelector('.pv-btn-t'), st.black ? 'Show slide' : 'Black screen');
    renderStatus();
    renderStart();
    tick();
  }

  function renderNext(st, nx) {
    let main;
    let sub = '';
    if (st.black || st.white) main = 'Next press shows the slide again';
    else if (st.timer && st.timer.pausedByBack) main = 'Next press resumes the timer (stays on this slide)';
    else if (!nx) main = 'End of the deck';
    else if (nx.kind === 'beat') {
      const r = row(nx.index);
      const b = r && r.beats[nx.beat];
      main = `Next: ${b ? b.id : `B${nx.beat + 1}`}`;
      sub = b && b.label ? b.label : '';
    } else {
      const r = row(nx.index);
      main = `Next slide: ${r ? (r.kind === 'content' ? r.plainTitle : r.title) : ''}`;
    }
    setText(ui.nextMain, main);
    setText(ui.nextSub, sub);
  }

  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
  function setBtn(btn, text, pressed) { setText(btn.querySelector('.pv-btn-t'), text); btn.setAttribute('aria-pressed', String(!!pressed)); }

  function renderBeats(st, r) {
    if (!r) return;
    const n = r.beats.length;
    const b = st.beat | 0;
    const sig = `${r.key}|${b}|${n}`;
    if (ui.beats.dataset.sig === sig) return;
    ui.beats.dataset.sig = sig;
    ui.beats.innerHTML = n > 1 ? r.beats.map((x, k) => `<span class="pv-chip" data-state="${k < b ? 'done' : k === b ? 'cur' : 'todo'}">${esc(x.id)}</span>`).join('') : '';
  }

  function renderTicks(r) {
    const dur = r.dur;
    ui.sbarTicks.innerHTML = dur > 0
      ? r.beats.slice(1).map((b, k) => `<span class="pv-tick" data-k="${k + 1}" style="left:${clamp((b.cue / dur) * 100, 0, 100)}%"></span>`).join('')
      : '';
  }

  function renderNotes(r) {
    let html = r.md ? renderMarkdown(r.md, r.beats.map((b) => b.cue)) : '<p class="pv-md-empty">No notes for this slide.</p>';
    if (r.kind === 'image' && r.pair) {
      for (const side of ['seoul', 'nyc']) {
        const p = r.pair[side];
        if (p && p.status === 'user-supply' && p.userSupplyNote) html += `<div class="pv-callout"><strong>Photo to supply (${side === 'nyc' ? 'New York' : 'Seoul'}):</strong> ${inline(undash(p.userSupplyNote))}</div>`;
      }
    }
    ui.notesBody.innerHTML = html;
    ui.notes.scrollTop = 0;
    userScrollAt = 0;
  }

  // ---------------- start screen (checklist until the first forward press)
  function setItem(id, ok, sub) {
    const li = ui.check(id);
    if (!li) return;
    const state = ok ? 'done' : 'todo';
    if (li.dataset.state !== state) li.dataset.state = state;
    if (li.getAttribute('role') === 'checkbox') li.setAttribute('aria-checked', String(!!ok));
    setText(li.querySelector('.pv-check-s'), sub);
  }

  function renderStart() {
    const show = !startHidden && isStartPhase(snap);
    ui.root.classList.toggle('is-start', show);
    if (!show) return;
    const extended = extendedNow();
    setItem('projector', extended, extended
      ? 'Second screen detected (Extend mode).'
      : 'Only one screen found. Press Win+P on the laptop, then choose Extend.');
    const mode = snapUi.mode || '';
    let pSub;
    if (snapUi.presenting && mode === 'single') pSub = 'Slides are fullscreen on this one screen (mirrored).';
    else if (snapUi.presenting) pSub = 'Slides are fullscreen on the projector. This view stays on the laptop.';
    else if (mode === 'fallback') pSub = 'Drag the slides window to the projector, click it, then press F.';
    else if (!live) pSub = 'Press P in the slides window to open this view and present.';
    else pSub = 'Press P here or in the slides window. The slides fill the projector.';
    setItem('present', !!snapUi.presenting, pSub);
    setItem('clicker', clickerTested, clickerTested
      ? 'The clicker reached the deck.'
      : 'Press its back button once and watch this line tick. Forward starts the talk.');
    setItem('pdf', pdfDone, pdfDone ? 'Marked as submitted today.' : 'Click this line once the PDF is submitted.');
  }

  // ---------------- status (connection / projector / clock)
  function renderStatus() {
    const state = live ? 'live' : (demo ? 'demo' : 'wait');
    if (ui.conn.dataset.state !== state) {
      ui.conn.dataset.state = state;
      ui.connText.textContent = live ? 'Connected to the slides' : (demo ? 'Preview, not connected' : 'Waiting for the slides window');
    }
    const presenting = !!snapUi.presenting;
    const extended = extendedNow();
    const pState = presenting ? 'on' : (extended ? 'ready' : 'none');
    const pText = presenting ? (snapUi.mode === 'single' ? 'Presenting on one screen' : 'Presenting on projector') : (extended ? 'Projector detected' : 'One screen');
    if (ui.proj.dataset.state !== pState) ui.proj.dataset.state = pState;
    setText(ui.projText, pText);
    ui.btnPresent.classList.toggle('is-ready', pState === 'ready');
    ui.btnPresent.setAttribute('aria-pressed', String(presenting));
    setText(ui.btnPresent.querySelector('.pv-btn-t'), presenting ? 'Presenting' : 'Present on projector');
  }

  // ---------------- tick (time-dependent, ~5x/s)
  function tick() {
    const now = new Date();
    setText(ui.clock, now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const st = snap;
    if (!st) return;
    const i = st.cur | 0;
    const r = row(i);
    if (!r) return;
    const T = liveTimes(st);
    const t = st.timer || {};
    const durMs = st.plannedDurMs ?? r.dur * 1000;

    // slide timer: elapsed / planned; amber in the last 15 s (half the slide for the 10 s photo slides), red when over
    const warnMs = Math.min(15000, durMs / 2);
    let sState = 'ok';
    if (durMs > 0 && T.slideMs > durMs) sState = 'over';
    else if (durMs > 0 && durMs - T.slideMs <= warnMs) sState = 'warn';
    if (!T.running) sState += ' paused';
    if (ui.slideTile.dataset.state !== sState) ui.slideTile.dataset.state = sState;
    setText(ui.slideV, durMs > 0 && T.slideMs > durMs ? `+${fmtMs(T.slideMs - durMs)}` : fmtMs(T.slideMs));
    setText(ui.slideOf, durMs > 0 ? `${T.slideMs > durMs ? 'over ' : '/ '}${fmtMs(durMs)}` : 'untimed');
    const frac = durMs > 0 ? clamp(T.slideMs / durMs, 0, 1) : 0;
    ui.sbarFill.style.transform = `scaleX(${frac})`;
    for (const tk of ui.sbarTicks.children) tk.classList.toggle('is-done', Number(tk.dataset.k) <= (st.beat | 0));

    // total vs plan (measured at the furthest slide reached, so a detour back is not "behind")
    const totalMs = st.plannedTotalMs ?? meta.plan.total * 1000;
    setText(ui.totalV, fmtMs(T.globalMs));
    setText(ui.totalOf, `/ ${fmtMs(totalMs)}`);
    const fr = row(T.furthest) || r;
    const fDur = fr.dur * 1000;
    const expected = fr.start * 1000 + Math.min(T.fSlideMs, fDur);
    const diff = T.globalMs - expected;
    let dState;
    let dText;
    if (!st.started && T.globalMs === 0) { dState = 'none'; dText = 'Not started'; }
    else if (Math.abs(diff) < 3000) { dState = 'on'; dText = 'On plan'; }
    else if (diff > 0) { dState = 'behind'; dText = `Behind ${fmtMs(diff)}`; }
    else { dState = 'ahead'; dText = `Ahead ${fmtMs(-diff)}`; }
    if (ui.delta.dataset.state !== dState) ui.delta.dataset.state = dState;
    setText(ui.delta, dText);

    // next auto-beat
    const nb = r.beats[(st.beat | 0) + 1];
    let bText;
    let bSub = '';
    let bState = 'idle';
    const isLive = st.isLive ?? (i === (st.furthest ?? i));
    if (!nb) bText = 'All beats shown';
    else if (!isLive) { bText = 'Revisiting'; bSub = 'Auto-beats run on the live slide only'; }
    else if (!st.autoBeats) {
      bText = 'Auto-beats off';
      const due = st.nextBeatInMs != null ? st.nextBeatInMs - T.dt : null;
      bSub = due != null ? (due > 0 ? `${nb.id} cue in ${fmtMs(due + 999)}` : `${nb.id} cue passed, press next`) : '';
    } else if (!T.running) { bText = `${nb.id} waits`; bSub = 'Timer paused'; }
    else {
      const raw = st.nextAutoBeatInMs != null ? st.nextAutoBeatInMs : (st.nextBeatInMs != null ? st.nextBeatInMs : null);
      const left = raw != null ? Math.max(0, raw - T.dt) : null;
      bText = left != null ? `${nb.id} in ${fmtMs(left + 999)}` : `${nb.id} next`;
      bSub = nb.label || '';
      bState = left != null && left <= 5000 ? 'soon' : 'run';
    }
    setText(ui.beatV, bText);
    setText(ui.beatSub, bSub);
    if (ui.beatTile.dataset.state !== bState) ui.beatTile.dataset.state = bState;

    // banner on the current slide
    let kind = 'none';
    let main = '';
    let sub = '';
    if (!live && !demo) { kind = 'wait'; main = 'Waiting for the slides window'; sub = 'Press Shift+P in the slides window, or open it from here.'; }
    else if (t.pausedByBack) { kind = 'paused'; main = 'Paused'; sub = 'Press the right arrow to resume.'; }
    else if (st.black || st.white) { kind = 'blank'; main = st.black ? 'The audience screen is black' : 'The audience screen is white'; sub = `Press ${st.black ? 'B' : 'W'} or the right arrow to show the slide.`; }
    else if (!t.running && st.started) { kind = 'hold'; main = 'Timer paused'; sub = 'Press T to resume.'; }
    if (ui.banner.dataset.kind !== kind) {
      ui.banner.dataset.kind = kind;
      ui.banner.setAttribute('aria-label', main ? `${main}. ${sub}` : '');
      ui.bannerBtn.hidden = kind !== 'wait';
    }
    setText(ui.bannerMain, main);
    setText(ui.bannerSub, sub);

    // notes cue highlighting
    markCues(st, T);
  }

  function markCues(st, T) {
    const cues = ui.notesBody.querySelectorAll('.pv-cue');
    if (!cues.length) return;
    const b = st.beat | 0;
    const isLive = st.isLive ?? (st.cur === st.furthest);
    const offset = isLive ? (st.beatOffsetMs || 0) : 0;
    let focus = null;
    let mark = '';
    for (const el of cues) {
      const k = Number(el.dataset.k);
      const due = Number(el.dataset.sec) * 1000 + offset;
      let state;
      if (k < b) state = 'done';
      else if (k === b) state = 'cur';
      else if (isLive && T.slideMs >= due) state = 'due';
      else state = 'todo';
      if (el.dataset.state !== state) el.dataset.state = state;
      if (state === 'cur' || state === 'due') focus = el;
      mark += state[0];
    }
    if (mark !== lastCueMark) {
      lastCueMark = mark;
      if (focus && Date.now() - userScrollAt > 6000) {
        const firstCue = focus === cues[0];
        const top = firstCue ? 0 : focus.getBoundingClientRect().top - ui.notes.getBoundingClientRect().top + ui.notes.scrollTop - 12;
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ui.notes.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  // ---------------- start
  // Render something at once: the URL demo state (?slide=...) or slide 1 with the checklist, replaced by the
  // leader's state as soon as it answers.
  const first = safe(localSnapshot, 'localSnapshot');
  if (first) { snap = first; snapAt = Date.now(); demo = params.has('slide'); render(); }
  setInterval(tick, 200);
  window.addEventListener('resize', () => { cur.fit(); nxt.fit(); });
  window.addEventListener('pagehide', () => { try { sync.close(); } catch { /* ignore */ } });

  const api = {
    sync,
    getSnapshot: () => snap,
    render,
    _test: { renderMarkdown, matchCue, meta, undash, noteToMarkdown, startVisible: () => ui.root.classList.contains('is-start') },
  };
  window.__seoulPresenter = api;
  return api;
}
