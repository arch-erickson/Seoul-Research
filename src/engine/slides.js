// Builds every slide of the deck as absolutely positioned HTML on the 1920x1080 stage, faithfully from the Figma
// extraction (spec/slides.json), and reveals beat groups per spec/timing.json.
//
// buildDeck(stageEl, { slidesSpec, timing, images, imageBriefs, references, diagrams, view, copy, getScale,
//                      reducedMotion, prefetch, manageDiagrams })
//   -> { count, show(index, beatsVisible, { instant }), keyAt(i), indexOf(key), info(i), beatsOf(i), current(),
//        visible(), sections, host, fitAppendix(), dispose() }
//
//   slidesSpec  spec/slides.json (the Figma extraction)          timing   spec/timing.json
//   images      spec/images.json or null (neutral photo panels)  references  src/slides/references.json (dossier s.10)
//   diagrams    { [id]: module } from diagrams.generated.js; a diagram id without a module keeps its Figma 2D elements
//   view        'audience' | 'presenter' | 'print'
//   copy        optional copy override in the spec/copy-v2.json format: an array of { key, elements: [{ id, action:
//               'keep'|'rewrite'|'remove', new }] } (or { slides: [...] }, or { [key]: [...] }). Rewrites replace the
//               element text, removes drop the element. Not passed by the build yet (scripts/build.mjs --copy).
//
// show(index, beatsVisible): beat k (0-based, k = state.beat) is visible iff k < beatsVisible, i.e. pass
// state.beat + 1. Infinity (or any number >= beatsOf(index)) = fully built. instant: no animation.
// Motion: one 2D system, src/engine/motion.js (Codex; wiring per codex/MOTION-NOTES.md). Each beat is a
// <div class="beat"> wrapper (display: contents) holding that beat's elements; revealBeat / hideBeat own their inline
// opacity and transform. A forward slide change crossfades (leaveSlide + enterSlide, 440 ms) and then reveals the
// first beat; photos push in with startPhoto; counters (data-motion="count") and rules (data-motion="draw") play
// inside their beat. instant (back, revisits, jumps, static, previews, print) = final state at once, no frames.
// The presenter view's decks are always instant. 3D diagrams keep their own motion (diagram host).

import { BEATMAP, OVERRIDES, COLOR_MAP } from '../slides/overrides.js';
import { motionMark } from '../slides/motion-marks.js';
import { buildImageSlide } from './images.js';
import { createDiagramHost } from './diagrams.js';
import { enterSlide, leaveSlide, revealBeat, hideBeat, startPhoto, finishAll } from './motion.js';

const MAX_STAGGER_STEPS = 8;
const NUM_TOKEN = /[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/;
const ROW_TOLERANCE = 14;

// ---------------------------------------------------------------- spec preparation (no DOM)

const normColor = (c) => (c && COLOR_MAP[String(c).toUpperCase()]) || c;

export function lineHeightPx(e) {
  if (Number.isFinite(e.lineHeightPx) && e.lineHeightPx > 0) return e.lineHeightPx;
  const lh = e.lineHeight || {};
  if (lh.unit === 'PIXELS') return lh.value;
  if (lh.unit === 'PERCENT') return (e.size * lh.value) / 100;
  return e.size * 1.219;
}

export function letterSpacingCss(e) {
  const ls = e.letterSpacing || {};
  if (!ls.value) return 'normal';
  return ls.unit === 'PIXELS' ? `${ls.value}px` : `${(ls.value / 100).toFixed(4)}em`;
}

/** Layout box in stage px. For text: the fixed-width box and the real height (lines x line height). */
export function boxOf(e) {
  if (e.kind === 'text') {
    const lines = e.lines || 1;
    return { x: e.x, y: e.y, w: e.fixedWidth || e.w, h: e.textH || lines * lineHeightPx(e) };
  }
  if (e.cssRotate && e.bbox) return { ...e.bbox };
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

const inside = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

function beatIndexForGroup(group, beats) {
  if (!group) return 0;
  for (let k = 0; k < beats.length; k++) {
    const show = beats[k].show || [];
    if (show.some((s) => s === group || s.startsWith(group))) return k;
  }
  const prefix = group.split(' · ')[0].trim();
  const k = beats.findIndex((b) => b.id === prefix);
  return k >= 0 ? k : 0;
}

/**
 * Copy override (spec/copy-v2.json format) -> Map(slideKey -> Map(elementId -> { action, text })).
 * Accepts an array of { key, elements }, { slides: [...] }, or { [key]: elements | { elements } }. Unknown actions = keep.
 */
export function normalizeCopy(copy) {
  const out = new Map();
  if (!copy || typeof copy !== 'object') return out;
  const add = (key, list) => {
    if (!key || !Array.isArray(list)) return;
    const m = out.get(key) || new Map();
    for (const it of list) {
      if (!it || it.id == null) continue;
      const action = String(it.action || 'keep').toLowerCase();
      if (action === 'remove') m.set(String(it.id), { action: 'remove' });
      else if (action === 'rewrite' && typeof it.new === 'string') m.set(String(it.id), { action: 'rewrite', text: it.new });
    }
    if (m.size) out.set(key, m);
  };
  const slides = Array.isArray(copy) ? copy : Array.isArray(copy.slides) ? copy.slides : null;
  if (slides) for (const s of slides) add(s && s.key, s && (s.elements || s.items));
  else for (const [key, v] of Object.entries(copy)) add(key, Array.isArray(v) ? v : v && (v.elements || v.items));
  return out;
}

/** Prepare one timing entry for rendering. Pure: no DOM. copyMap = normalizeCopy(copy) (optional). */
export function prepareSlide(entry, slidesByKey, copyMap = null) {
  const beats = entry.beats && entry.beats.length ? entry.beats : [{ id: 'B1', cue: 0, show: [] }];
  const out = { key: entry.key, kind: entry.kind, n: entry.n ?? null, title: entry.title || '', beats, beatCount: beats.length, elements: [], diagrams: [] };

  // Diagram slots: region + the state each diagram is in after each beat (cumulative).
  for (const d of entry.diagrams || []) {
    let st = 0;
    const beatStates = beats.map((b) => {
      if (b.diagram && Object.prototype.hasOwnProperty.call(b.diagram, d.id)) st = b.diagram[d.id];
      return st;
    });
    out.diagrams.push({ id: d.id, region: { ...d.region }, replaces: d.replaces || '', beatStates, states: Math.max(0, ...beatStates) });
  }

  if (entry.kind !== 'content') return out;
  const spec = slidesByKey.get(entry.key);
  if (!spec) return out;
  out.figmaId = spec.figmaId;
  out.notes = spec.notes || '';
  const ov = OVERRIDES[entry.key] || {};
  const beatmap = BEATMAP[entry.key];
  const copyOf = (copyMap && copyMap.get(entry.key)) || null;

  const els = [...spec.elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const src of els) {
    const patch = ov[src.id];
    if (patch && patch.remove) continue;
    const cp = copyOf && copyOf.get(src.id);
    if (cp && cp.action === 'remove') continue;
    const e = { ...src };
    if (patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'remove' || k === 'afterCopy') continue;
        e[k] = typeof v === 'function' ? v(src[k], src) : v;
      }
      if (patch.lines && e.kind === 'text') e.textH = patch.lines * lineHeightPx(e);
    }
    if (cp && cp.action === 'rewrite' && e.kind === 'text') {
      e.chars = cp.text;
      e.copied = true;
      // Explicit line breaks set the height; a wrapping box keeps its Figma line count as a minimum.
      const hard = cp.text.split('\n').length;
      e.lines = e.wraps ? Math.max(hard, e.lines || 1) : hard;
      e.textH = e.lines * lineHeightPx(e);
    }
    // OVERRIDES may adjust copy-v2 text after it is applied (e.g. a set line break): { afterCopy: (text) => text }
    if (patch && typeof patch.afterCopy === 'function' && e.copied) {
      e.chars = patch.afterCopy(e.chars, e);
      const hard = e.chars.split('\n').length;
      e.lines = e.wraps ? Math.max(hard, e.lines || 1) : hard;
      e.textH = e.lines * lineHeightPx(e);
    }
    if (e.fill) e.fill = normColor(e.fill);
    if (e.color) e.color = normColor(e.color);
    e.box = boxOf(e);
    // Beat
    if (beatmap) e.beat = Object.prototype.hasOwnProperty.call(beatmap, e.id) ? beatmap[e.id] : 0;
    else e.beat = beatIndexForGroup(e.group, beats);
    e.beat = Math.max(0, Math.min(beats.length - 1, e.beat));
    // 2D fallback of a diagram: element centre inside the diagram region.
    const cx = e.box.x + e.box.w / 2, cy = e.box.y + e.box.h / 2;
    const d = out.diagrams.find((dd) => inside(cx, cy, dd.region));
    e.fallbackOf = d ? d.id : null;
    out.elements.push(e);
  }

  // Stagger rows per beat (by top edge).
  for (let k = 0; k < beats.length; k++) {
    const items = out.elements.filter((e) => e.beat === k).sort((a, b) => a.box.y - b.box.y);
    let row = -1, rowY = -Infinity;
    for (const e of items) {
      if (e.box.y - rowY > ROW_TOLERANCE) { row++; rowY = e.box.y; }
      e.row = row;
    }
  }
  return out;
}

// ---------------------------------------------------------------- DOM

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const STEM = { 300: 0.055, 400: 0.072, 500: 0.088, 600: 0.1, 700: 0.115, 800: 0.13, 900: 0.15 };

// Montserrat (as vendored) has no glyphs for → ≥ and subscript ₂. Draw them so no fallback font ever appears.
export function richText(chars, weight = 400) {
  const k = STEM[weight] || 0.08;
  let html = '';
  for (const ch of String(chars ?? '')) {
    if (ch === '→') {
      const sw = (k * 20 / 0.56).toFixed(2);
      html += `<svg class="g g-arrow" viewBox="0 0 20 16" aria-label="→"><path d="M1.6 8H18.2M12.2 2.4L18.2 8L12.2 13.6" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (ch === '≥') {
      const sw = (k * 16 / 0.5).toFixed(2);
      html += `<svg class="g g-geq" viewBox="0 0 16 20" aria-label="≥"><path d="M2.5 2.5L13.5 7.5L2.5 12.5M2.5 17.2H13.5" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (ch === '₂') {
      html += '<span class="g-sub">2</span>';
    } else {
      html += esc(ch);
    }
  }
  return html;
}

function rgba(hex, a = 1) {
  if (!hex) return 'transparent';
  if (a >= 0.999) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function arcPath(w, h, arc) {
  const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
  let a0 = arc.startingAngle || 0, a1 = arc.endingAngle ?? Math.PI * 2;
  const ir = arc.innerRadius || 0;
  const P = (a, f) => `${(cx + rx * f * Math.cos(a)).toFixed(3)} ${(cy + ry * f * Math.sin(a)).toFixed(3)}`;
  const sweep = a1 - a0;
  if (sweep >= Math.PI * 2 - 1e-3) {
    // full ellipse or full ring
    const ring = (f) => `M${P(0, f)}A${(rx * f).toFixed(3)} ${(ry * f).toFixed(3)} 0 1 1 ${P(Math.PI, f)}A${(rx * f).toFixed(3)} ${(ry * f).toFixed(3)} 0 1 1 ${P(0, f)}Z`;
    return ir > 0 ? ring(1) + ring(ir) : ring(1);
  }
  const large = sweep > Math.PI ? 1 : 0;
  let d = `M${P(a0, 1)}A${rx} ${ry} 0 ${large} 1 ${P(a1, 1)}`;
  if (ir > 0) d += `L${P(a1, ir)}A${rx * ir} ${ry * ir} 0 ${large} 0 ${P(a0, ir)}Z`;
  else d += `L${cx} ${cy}Z`;
  return d;
}

// data-motion="count": a plain text element counts as a whole; in rich text (inline SVG glyphs, CO2 subscript) only
// its number is wrapped, so the unit markup stays intact.
function markCount(d, e) {
  const chars = String(e.chars ?? '');
  if (!/[→≥₂]/.test(chars)) { d.dataset.motion = 'count'; return; }
  const m = chars.match(NUM_TOKEN);
  if (!m) return;
  d.innerHTML = richText(chars.slice(0, m.index), e.weight) + `<span data-motion="count">${esc(m[0])}</span>` +
    richText(chars.slice(m.index + m[0].length), e.weight);
}

function makeElement(e) {
  const d = document.createElement('div');
  d.dataset.id = e.id;
  d.dataset.kind = e.kind;
  d.dataset.beat = String(e.beat);
  if (e.fallbackOf) d.dataset.fb = e.fallbackOf;
  if (e.motion === 'draw') d.dataset.motion = 'draw';
  d.dataset.motionStep = String(Math.min(MAX_STAGGER_STEPS, e.row || 0)); // one stagger step per visual row
  const st = d.style;
  st.left = e.x + 'px';
  st.top = e.y + 'px';
  st.setProperty('--o', String(e.opacity ?? 1));

  if (e.kind === 'text') {
    const wrap = !!e.wraps;
    d.className = 'el t' + (wrap ? ' wrap' : '');
    if (e.lines) d.dataset.lines = String(e.lines); // Figma line count: audit compares the browser's wrapping
    st.width = (e.fixedWidth || e.w) + 'px';
    st.fontSize = e.size + 'px';
    st.fontWeight = String(e.weight || 400);
    st.lineHeight = lineHeightPx(e).toFixed(2) + 'px';
    st.letterSpacing = letterSpacingCss(e);
    st.color = e.color || 'var(--ink)';
    st.textAlign = (e.align || 'LEFT').toLowerCase() === 'justified' ? 'justify' : (e.align || 'LEFT').toLowerCase();
    d.innerHTML = richText(e.chars, e.weight);
    if (e.motion === 'count') markCount(d, e);
    return d;
  }

  st.width = e.w + 'px';
  st.height = e.h + 'px';
  if (e.cssRotate) st.transform = `rotate(${e.cssRotate}deg)`;

  if (e.kind === 'rect') {
    d.className = 'el r';
    st.background = rgba(e.fill, e.fillOpacity ?? 1);
    if (e.radius) st.borderRadius = e.radius + 'px';
    return d;
  }
  if (e.kind === 'ellipse') {
    d.className = 'el e';
    const arc = e.arc || {};
    const full = (arc.endingAngle ?? Math.PI * 2) - (arc.startingAngle || 0) >= Math.PI * 2 - 1e-3 && !arc.innerRadius;
    if (full) {
      st.background = rgba(e.fill, e.fillOpacity ?? 1);
      st.borderRadius = '50%';
    } else {
      d.innerHTML = `<svg width="${e.w}" height="${e.h}" viewBox="0 0 ${e.w} ${e.h}" aria-hidden="true"><path d="${arcPath(e.w, e.h, arc)}" fill="${e.fill}" fill-opacity="${e.fillOpacity ?? 1}" fill-rule="evenodd"/></svg>`;
    }
    return d;
  }
  if (e.kind === 'svg') {
    d.className = 'el v';
    d.innerHTML = e.svg || '';
    const svg = d.querySelector('svg');
    if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('aria-hidden', 'true'); }
    if (e.clips) st.overflow = 'hidden';
    return d;
  }
  if (e.kind === 'line') {
    d.className = 'el r';
    st.background = e.stroke || e.fill || 'var(--ink)';
    return d;
  }
  d.className = 'el';
  return d;
}

export const APPENDIX_TITLE = 'References and Image Credits';

/** Text the engine shows must not carry em or en dashes: "Publisher — Title" -> "Publisher: Title",
 *  number ranges -> "2001 to 2023" (the user's rule for slide text), "EU–Korea" -> "EU-Korea". */
export function undash(s) {
  return String(s ?? '')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s+[–—]\s+/, ': ')
    .replace(/\s+[–—]\s+/g, ', ')
    .replace(/[–—]/g, '-');
}

const sideName = (side) => (side === 'seoul' ? 'Seoul' : 'New York');

/** Image credit lines from spec/images.json (photos actually shown on the slides only). */
export function imageCredits(images) {
  const out = [];
  for (const p of (images && images.pairs) || []) {
    for (const side of ['seoul', 'nyc']) {
      const en = p && p[side];
      if (!en || !en.credit || en.status === 'user-supply' || en.status === 'missing' || !en.file) continue;
      const credit = undash(String(en.credit).replace(/^\s*photo:\s*/i, ''));
      const lic = en.license && !credit.toLowerCase().includes(String(en.license).toLowerCase()) ? ` (${undash(en.license)})` : '';
      out.push({ id: p.id, side, subject: undash(en.subject || ''), text: `${credit}${lic}` });
    }
  }
  return out;
}

function buildAppendix(section, { references, images }) {
  section.classList.add('appendix');
  const items = [];
  const title = document.createElement('div');
  title.className = 'el t refs-title';
  title.dataset.beat = '0';
  title.style.setProperty('--o', '1');
  title.textContent = APPENDIX_TITLE;
  section.appendChild(title);
  items.push({ el: title, beat: 0, row: 0 });

  const body = document.createElement('div');
  body.className = 'el t flow refs-body';
  body.dataset.beat = '0';
  body.style.setProperty('--o', '1');
  // The separator is glued to the end of the previous title (no-break space) so a line never starts with it.
  const sep = '<span class="sep" aria-hidden="true"> ·</span> ';
  let html = '';
  for (const g of (references && references.groups) || []) {
    const titles = (g.items || []).map((it) => undash(typeof it === 'string' ? it : it && it.title)).filter(Boolean);
    if (!titles.length) continue;
    html += `<section class="refs-group"><h3>${esc(undash(g.name))}</h3><p>` + titles.map((t) => `<span class="ref">${richText(t)}</span>`).join(sep) + '</p></section>';
  }
  const credits = imageCredits(images);
  if (credits.length) {
    html += '<section class="refs-group refs-credits"><h3>Image credits</h3><p>' + credits.map((c) =>
      `<span class="ref"><b>${esc(c.id)} ${esc(sideName(c.side))}</b> ${c.subject ? esc(c.subject) + ': ' : ''}${richText(c.text)}</span>`).join(sep) + '</p></section>';
  }
  body.innerHTML = html;
  section.appendChild(body);
  items.push({ el: body, beat: 0, row: 1 });
  return items;
}

// ---------------------------------------------------------------- closing slides (spec/qa-slide.md)
// qa: a centered bold "Questions?" and a small countdown below it; thanks: "Thank You" and the Instagram handle.
export const CLOSING_TEXT = { qa: 'Questions?', thanks: 'Thank You', handle: 'instagram: erickson_architecture' };
export const COUNTDOWN_LOW_MS = 30000; // red in the last 30 s
/** Remaining ms -> "m:ss", rounded up so the full time shows on entry and 0:00 only at the end. */
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildClosing(section, entry, view) {
  section.classList.add('closing');
  const mk = (cls, text, row) => {
    const d = document.createElement('div');
    d.className = `el t ${cls}`;
    d.dataset.beat = '0';
    d.dataset.motionStep = String(row);
    d.style.setProperty('--o', '1');
    d.textContent = text;
    section.appendChild(d);
    return { el: d, beat: 0, row };
  };
  if (entry.kind === 'qa') {
    const items = [mk('closing-title', CLOSING_TEXT.qa, 0)];
    const totalMs = Number(entry.countdown) > 0 ? Number(entry.countdown) * 1000 : 0;
    if (totalMs && view !== 'print') { // the PDF shows no countdown
      const c = mk('qa-countdown', fmtCountdown(totalMs), 1);
      c.el.dataset.countdown = String(totalMs);
      c.el.setAttribute('role', 'timer');
      items.push(c);
    }
    return items;
  }
  return [mk('closing-title', CLOSING_TEXT.thanks, 0), mk('closing-handle', CLOSING_TEXT.handle, 1)];
}

/** Sets the qa countdown from the slide's own timer (slideMs accrues only while the talk timer runs, so Tab / T pause it). */
export function setCountdown(section, slideMs) {
  const el = section && section.querySelector('.qa-countdown');
  if (!el) return null;
  const left = Math.max(0, (Number(el.dataset.countdown) || 0) - (Number(slideMs) || 0));
  const txt = fmtCountdown(left);
  if (el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('is-low', left <= COUNTDOWN_LOW_MS);
  el.classList.toggle('is-done', left <= 0);
  return left;
}

export const APPENDIX_FONT = { max: 17, min: 10.5, step: 0.25 };
/** Largest font size at which the appendix fits inside its box (no extra column, nothing clipped). */
export function fitAppendix(section) {
  const body = section && section.querySelector('.refs-body');
  if (!body || !body.isConnected) return null;
  const hidden = getComputedStyle(section).display === 'none';
  if (hidden) section.style.display = 'block'; // measure even while another slide is showing
  let fs = APPENDIX_FONT.max;
  for (; fs > APPENDIX_FONT.min; fs -= APPENDIX_FONT.step) {
    body.style.fontSize = fs + 'px';
    if (body.scrollWidth <= body.clientWidth + 1 && body.scrollHeight <= body.clientHeight + 1) break;
  }
  if (fs <= APPENDIX_FONT.min) { fs = APPENDIX_FONT.min; body.style.fontSize = fs + 'px'; }
  if (hidden) section.style.display = '';
  body.dataset.fit = String(fs);
  return fs;
}

export async function fontsReady(timeoutMs = 4000) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const loads = [];
  for (const w of [300, 400, 500, 600, 700, 900]) loads.push(document.fonts.load(`${w} 40px Montserrat`, 'AaBb0123·—₩'));
  const timeout = new Promise((r) => setTimeout(r, timeoutMs));
  try { await Promise.race([Promise.all(loads).then(() => document.fonts.ready), timeout]); } catch (e) { /* keep going */ }
}

// ---------------------------------------------------------------- deck

export function buildDeck(stageEl, opts = {}) {
  const {
    slidesSpec, timing, images = null, imageBriefs = null, references = null, diagrams = {}, copy = null,
    view = 'audience', getScale = () => 1, reducedMotion = (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches),
    prefetch = view === 'audience' ? 1 : 0, manageDiagrams = 'window',
    motion = view === 'audience' && !reducedMotion, // 2D motion (motion.js); false = always instant
  } = opts;
  if (!slidesSpec || !timing) throw new Error('buildDeck: slidesSpec and timing are required');

  const slidesByKey = new Map((slidesSpec.slides || []).map((s) => [s.key, s]));
  const copyMap = normalizeCopy(copy);
  const pairById = new Map();
  for (const p of (imageBriefs && imageBriefs.pairs) || []) pairById.set(p.id, p);
  for (const p of (images && images.pairs) || []) pairById.set(p.id, mergePair(pairById.get(p.id), p));

  const fbIndex = new Map(); // diagram id -> [elements]
  const host = createDiagramHost({
    registry: diagrams || {}, view, getScale, reducedMotion,
    onLiveChange(id, on) {
      for (const el of fbIndex.get(id) || []) el.classList.toggle('fb-off', on !== false);
    },
  });

  const root = document.createElement('div');
  root.className = 'deck';
  root.dataset.view = view;
  stageEl.appendChild(root);

  const slides = timing.order.map((entry, index) => {
    const prep = prepareSlide(entry, slidesByKey, copyMap);
    const section = document.createElement('section');
    section.className = `slide kind-${entry.kind}`;
    section.dataset.key = entry.key;
    section.dataset.index = String(index);
    section.dataset.beats = String(prep.beatCount);
    if (prep.figmaId) section.dataset.figma = prep.figmaId;
    let items = [];
    const slots = [];
    if (entry.kind === 'content') {
      prep.elements.forEach((e, rank) => {
        // A 2D fallback of a diagram with a live 3D module is hidden: the diagram owns its motion.
        const mark = motionMark(entry.key, e.id);
        e.motion = mark && !(e.fallbackOf && diagrams && diagrams[e.fallbackOf]) ? mark : null;
        const el = makeElement(e);
        el.style.zIndex = String(rank + 1); // the Figma stacking order survives the per-beat wrappers
        section.appendChild(el);
        items.push({ el, beat: e.beat, row: e.row || 0, spec: e });
        if (e.fallbackOf) {
          if (!fbIndex.has(e.fallbackOf)) fbIndex.set(e.fallbackOf, []);
          fbIndex.get(e.fallbackOf).push(el);
        }
      });
    } else if (entry.kind === 'image') {
      const pair = pairById.get(entry.key) || { id: entry.key };
      items = buildImageSlide(section, pair, { view }).map((it) => ({ ...it, row: 0 }));
      prep.pair = pair;
    } else if (entry.kind === 'appendix') {
      items = buildAppendix(section, { references, images: { pairs: [...pairById.values()].filter((p) => !p.placeholder) } });
    } else if (entry.kind === 'qa' || entry.kind === 'closing') {
      items = buildClosing(section, entry, view);
    }
    for (const d of prep.diagrams) {
      const slot = document.createElement('div');
      slot.className = 'diagram-slot';
      slot.dataset.diagram = d.id;
      Object.assign(slot.style, { left: d.region.x + 'px', top: d.region.y + 'px', width: d.region.w + 'px', height: d.region.h + 'px' });
      section.appendChild(slot);
      slots.push({ ...d, slot });
    }
    // One wrapper per beat, in place of the elements (so the photo gutter stays on top), elements keep their order.
    // display: contents keeps the section as the containing block of the absolutely positioned elements.
    const groups = prep.beats.map((b, k) => {
      const g = document.createElement('div');
      g.className = 'beat';
      g.dataset.beatGroup = String(k);
      return g;
    });
    const first = items.length ? items[0].el : null;
    for (const g of groups) section.insertBefore(g, first && first.parentNode === section ? first : null);
    for (const it of items) groups[Math.max(0, Math.min(groups.length - 1, it.beat))].appendChild(it.el);
    root.appendChild(section);
    // Initial state: nothing revealed. Motion captures each element's authored opacity and transform here.
    for (const g of groups) hideBeat(g, { instant: true });
    return { index, key: entry.key, kind: entry.kind, entry, prep, section, items, slots, groups, on: groups.map(() => false), target: 0, enteredAt: 0, visible: 0 };
  });

  // 2D motion plays in the audience view only; the presenter previews and print are always instant.
  const motionOn = view === 'audience' && !!motion;
  let cur = -1;
  let prefetchTimer = null;
  let fade = null; // the crossfade in progress: { token, from }
  let fadeSeq = 0;

  function clampIndex(i) { return Math.max(0, Math.min(slides.length - 1, i | 0)); }

  function endFade() {
    if (fade && fade.from) fade.from.section.classList.remove('is-leaving');
    fade = null;
  }

  // Photo push-in fitted to the 10 s interstitial: Seoul's ends at New York's cue, New York's at the slide's end.
  function photoMs(S, k) {
    const beats = S.prep.beats;
    const endSec = k + 1 < beats.length ? beats[k + 1].cue : (S.entry.dur || timing.imageSlideSeconds || 10);
    return Math.max(1500, endSec * 1000 - (performance.now() - S.enteredAt));
  }

  // Beats [0, n) visible. Of the newly visible beats only the last one with elements plays (animate); the others
  // appear at once. Beats past n are hidden at once.
  function reveal(S, n, animate) {
    for (let k = S.groups.length - 1; k >= n; k--) {
      if (!S.on[k]) continue;
      S.on[k] = false;
      if (S.groups[k].children.length) hideBeat(S.groups[k], { instant: true });
    }
    const fresh = [];
    for (let k = 0; k < n; k++) if (!S.on[k]) fresh.push(k);
    const play = animate ? fresh.filter((k) => S.groups[k].children.length).pop() : -1;
    for (const k of fresh) {
      S.on[k] = true;
      const g = S.groups[k];
      if (!g.children.length) continue; // a beat that only moves a diagram: nothing to reveal, nothing interrupted
      const instant = k !== play;
      revealBeat(g, { instant });
      for (const panel of g.querySelectorAll('.img-panel')) startPhoto(panel, { durationMs: instant ? 0 : photoMs(S, k) });
    }
    S.visible = n;
  }

  function stateFor(d, n) {
    if (n <= 0) return 0;
    return d.beatStates[Math.min(n, d.beatStates.length) - 1] || 0;
  }

  function ensureMounted(S) {
    for (const d of S.slots) if (!host.isLive(d.id)) host.mount(d.slot, d.id);
  }

  function manageWindow(index) {
    if (manageDiagrams !== 'window') return;
    const keep = new Set();
    for (let i = index; i <= Math.min(slides.length - 1, index + prefetch); i++) for (const d of slides[i].slots) keep.add(d.id);
    for (const id of host.liveIds()) if (!keep.has(id)) host.unmount(id);
    clearTimeout(prefetchTimer);
    if (prefetch > 0) {
      prefetchTimer = setTimeout(() => {
        for (let i = index + 1; i <= Math.min(slides.length - 1, index + prefetch); i++) {
          const N = slides[i];
          for (const d of N.slots) {
            if (host.isLive(d.id)) continue;
            host.mount(d.slot, d.id);
            host.setState(d.id, stateFor(d, N.visible), { instant: true });
          }
        }
      }, 700);
    }
  }

  // Decode the photos of the next slides ahead of time so an image slide never appears half-decoded.
  const decoded = new WeakSet();
  function predecode(index) {
    for (let i = index; i <= Math.min(slides.length - 1, index + 2); i++) {
      if (slides[i].kind !== 'image') continue;
      for (const img of slides[i].section.querySelectorAll('img')) {
        if (decoded.has(img) || typeof img.decode !== 'function') continue;
        decoded.add(img);
        img.decode().catch(() => {});
      }
    }
  }

  function applyDiagrams(S, n, instant) {
    const ps = [];
    for (const d of S.slots) ps.push(host.setState(d.id, stateFor(d, n), { instant }));
    return Promise.all(ps);
  }

  function show(index, beatsVisible = 1, { instant = false } = {}) {
    index = clampIndex(index);
    const S = slides[index];
    let n = beatsVisible === Infinity ? S.prep.beatCount : Math.max(0, Math.min(S.prep.beatCount, Math.floor(beatsVisible)));
    const anim = !instant && motionOn;
    if (!anim) finishAll(); // jumps, back, revisits: anything still playing ends at its final state first
    if (index !== cur) {
      const P = slides[cur];
      endFade();
      reveal(S, 0, false); // entered from nothing; a revisit is rebuilt below
      if (P) P.section.classList.remove('is-current');
      S.section.classList.add('is-current');
      cur = index;
      S.enteredAt = performance.now();
      S.target = n;
      if (manageDiagrams === 'window') ensureMounted(S);
      if (S.kind === 'appendix') fitAppendix(S.section);
      if (anim) {
        // Crossfade: both sections stay displayed for 440 ms, then the first beat plays. The token drops a stale
        // continuation after rapid clicks; a beat change during the fade only updates S.target.
        const token = ++fadeSeq;
        fade = { token, from: P || null };
        const ps = [];
        if (P) { P.section.classList.add('is-leaving'); ps.push(leaveSlide(P.section)); }
        ps.push(enterSlide(S.section));
        Promise.all(ps).then(() => {
          if (!fade || fade.token !== token) return;
          endFade();
          if (cur === index) reveal(S, S.target, true);
        });
      } else {
        enterSlide(S.section, { instant: true });
        reveal(S, n, false);
      }
    } else if (fade) {
      S.target = n;
      if (!anim) { endFade(); reveal(S, n, false); }
    } else {
      reveal(S, n, anim);
    }
    S.visible = n;
    const p = applyDiagrams(S, n, !anim);
    manageWindow(index);
    if (view !== 'print') predecode(index);
    return p;
  }

  function info(i) {
    const S = slides[clampIndex(i)];
    return { index: S.index, key: S.key, kind: S.kind, n: S.prep.n, title: S.prep.title, beats: S.prep.beatCount,
      diagrams: S.slots.map((d) => ({ id: d.id, region: d.region, states: d.states, beatStates: d.beatStates, live: host.isLive(d.id), slot: d.slot })),
      section: S.section, pair: S.prep.pair || null, notes: S.prep.notes || '' };
  }

  return {
    count: slides.length,
    show,
    keyAt: (i) => (slides[i] ? slides[i].key : null),
    indexOf: (key) => slides.findIndex((s) => s.key === key),
    info,
    beatsOf: (i) => (slides[i] ? slides[i].prep.beatCount : 0),
    current: () => cur,
    visible: () => (slides[cur] ? slides[cur].visible : 0),
    sections: slides.map((s) => s.section),
    slides,
    host,
    root,
    mountDiagrams: (i) => ensureMounted(slides[clampIndex(i)]),
    stateFor,
    fitAppendix: () => { for (const s of slides) if (s.kind === 'appendix') fitAppendix(s.section); },
    /** qa slide: countdown from that slide's timer ms (no-op on other slides). */
    countdown: (i, slideMs) => (slides[i] && slides[i].kind === 'qa' ? setCountdown(slides[i].section, slideMs) : null),
    dispose() {
      finishAll();
      endFade();
      clearTimeout(prefetchTimer);
      host.disposeAll();
      root.remove();
    },
  };
}

function mergePair(base, p) {
  if (!base) return p;
  const out = { ...base, ...p };
  for (const side of ['seoul', 'nyc']) out[side] = { ...(base[side] || {}), ...(p[side] || {}) };
  out.placeholder = false;
  return out;
}
