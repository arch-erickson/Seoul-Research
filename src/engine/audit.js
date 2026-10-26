// Mechanical overlap audit (ARCHITECTURE.md section 1 hard rule + section 8).
//   ?audit=1   the current slide at the current beat
//   ?audit=all every slide x every beat, in one page load
// Checks: text-vs-text (glyph boxes per line), text-vs-shape (a shape that fully contains the text is its container and
// is allowed; anything else that touches it is a violation unless whitelisted in src/slides/overrides.js), elements
// outside the stage, appendix overflow, each live diagram's own audit(), diagram labels vs HTML text, and HTML text
// over a live diagram's rendered pixels. Result JSON goes into <script id="audit-result" type="application/json">.
// Also reported: fontsOk (document.fonts.check for "900 80px Montserrat" and "400 20px Montserrat" after
// document.fonts.ready, and both faces really loaded), runtimeErrors and blockedResources (src/engine/errors.js),
// wrapMismatch (a wrapping text box that breaks into a different number of lines than in Figma) and appendixFont.
// ok = no overlap violations, fonts loaded, no runtime errors, nothing blocked.
//
// runAudit({ deck, all, overlay, only, chrome, onShow }) -> Promise<result>

import { fontsReady } from './slides.js';
import { AUDIT_ALLOW } from '../slides/overrides.js';
import { runtimeErrors, blockedResources } from './errors.js';
import './frames.js';

const EPS = 0.5;           // px of overlap tolerated on each axis
const CONTAIN_TOL = 1.0;   // px slack when deciding that a shape contains a text
const ASCENT = 0.968;      // Montserrat hhea ascender / UPM (content-area top = baseline - 0.968 em)
const RED = '#CD2E3A';

// A timer yield, not requestAnimationFrame: layout and WebGL readback are synchronous, and a pending rAF stalls
// headless Chrome's virtual time (shot.mjs --dom, --print-to-pdf), so the audit would never finish there.
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

function writeResult(obj) {
  let el = document.getElementById('audit-result');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/json';
    el.id = 'audit-result';
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(obj, null, 1);
}

const inter = (a, b) => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > EPS && h > EPS ? { x, y, w, h } : null;
};
const contains = (outer, inner, tol = CONTAIN_TOL) =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
const union = (rs) => {
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};
const round = (r) => r && { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.w.toFixed(1), h: +r.h.toFixed(1) };

let measureCtx = null;
function glyphExtents(text, weight, size) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${weight} ${size}px Montserrat`;
  let asc = 0, desc = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const m = measureCtx.measureText(line);
    asc = Math.max(asc, m.actualBoundingBoxAscent || 0);
    desc = Math.max(desc, m.actualBoundingBoxDescent || 0);
  }
  if (!asc && !desc) { asc = 0.7 * size; desc = 0; }
  return { asc, desc };
}

function makeMapper(deck) {
  const r = deck.root.getBoundingClientRect();
  const s = r.width / 1920 || 1;
  return (cr) => ({ x: (cr.left - r.left) / s, y: (cr.top - r.top) / s, w: cr.width / s, h: cr.height / s });
}

function isShown(el) {
  for (let n = el; n && !n.classList.contains('slide'); n = n.parentElement) {
    if (n.classList.contains('off') || n.classList.contains('fb-off')) return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02) return false;
  }
  return true;
}

/** Per-line glyph boxes of a text element, in stage px. Text fragments: the content area is converted to the
 *  glyph extent (baseline - ascent .. baseline + descent of the actual characters); inline SVG glyphs use their box. */
function textLines(el, map) {
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 16;
  const lh = parseFloat(cs.lineHeight) || size * 1.2;
  const { asc, desc } = glyphExtents(el.textContent, cs.fontWeight || '400', size);
  const frags = [];
  const range = document.createRange();
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        if (!ch.nodeValue || !ch.nodeValue.replace(/\s+/g, '')) continue;
        const fs = parseFloat(getComputedStyle(ch.parentElement).fontSize) || size;
        const k = fs / size;
        range.selectNodeContents(ch);
        for (const cr of range.getClientRects()) {
          const r = map(cr);
          if (r.w < 0.5) continue;
          const baseline = r.y + ASCENT * fs;
          frags.push({ x: r.x, y: baseline - asc * k, w: r.w, h: Math.max(1, (asc + desc) * k) });
        }
      } else if (ch.nodeType === 1) {
        if (ch.tagName.toLowerCase() === 'svg') {
          const r = map(ch.getBoundingClientRect());
          if (r.w > 0.5 && r.h > 0.5) frags.push(r);
        } else walk(ch);
      }
    }
  };
  walk(el);
  const lines = [];
  for (const r of frags.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const cy = r.y + r.h / 2;
    let L = lines.find((l) => Math.abs(l.cy - cy) < lh * 0.45);
    if (!L) { L = { cy, rs: [] }; lines.push(L); }
    L.rs.push(r);
  }
  return lines.map((L) => union(L.rs));
}

function label(el) {
  const id = el.dataset.id || (el.closest('[data-id]') && el.closest('[data-id]').dataset.id) || el.className;
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return txt ? `${id} "${txt.slice(0, 48)}${txt.length > 48 ? '…' : ''}"` : String(id);
}

/** One readback per canvas (per diagram state): [{ cr (stage px), w, h, data }]. */
function readCanvases(slot, map) {
  const out = [];
  for (const c of slot.querySelectorAll('canvas')) {
    if (!c.width || !c.height) continue;
    const cr = map(c.getBoundingClientRect());
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const g = tmp.getContext('2d', { willReadFrequently: true });
    try {
      g.drawImage(c, 0, 0);
      out.push({ cr, w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data });
    } catch (e) { /* tainted or lost context */ }
  }
  return out;
}

function canvasInkCount(pixels, rect) {
  let count = 0, area = 0;
  for (const P of pixels) {
    const it = inter(P.cr, rect);
    if (!it) continue;
    const x0 = Math.max(0, Math.floor(((it.x - P.cr.x) / P.cr.w) * P.w)), x1 = Math.min(P.w, Math.ceil(((it.x + it.w - P.cr.x) / P.cr.w) * P.w));
    const y0 = Math.max(0, Math.floor(((it.y - P.cr.y) / P.cr.h) * P.h)), y1 = Math.min(P.h, Math.ceil(((it.y + it.h - P.cr.y) / P.cr.h) * P.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (P.data[(y * P.w + x) * 4 + 3] > 40) count++;
    area += Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  }
  return { count, area };
}

function colorOf(el) {
  const cs = getComputedStyle(el);
  return el.classList.contains('t') ? cs.color : cs.backgroundColor;
}
const isRed = (c) => /rgba?\(\s*205,\s*46,\s*58/.test(c || '');

function auditCurrent(deck, index, cache = new Map(), chrome = []) {
  const map = makeMapper(deck);
  const section = deck.sections[index];
  const info = deck.info(index);
  const key = info.key;
  const allow = (AUDIT_ALLOW[key] || []).map(([a, b]) => `${a}|${b}`);
  const violations = [];

  // Collect visible texts and shapes.
  const texts = [];
  const wrapMismatch = [];
  for (const el of section.querySelectorAll('.t')) {
    if (!isShown(el)) continue;
    const lines = textLines(el, map);
    if (!lines.length) continue;
    texts.push({ el, lines, box: union(lines), name: label(el), id: el.dataset.id || null });
    const want = Number(el.dataset.lines || 0);
    if (want && el.classList.contains('wrap') && lines.length !== want) wrapMismatch.push({ el: label(el), figma: want, html: lines.length });
  }
  // Stage chrome that the audience also sees (the on-slide timer of a single-screen talk): its texts are checked
  // against the slide like any other text. The caller passes only chrome that is visible on this slide.
  for (const c of chrome || []) {
    if (!c || !c.el || !c.el.isConnected) continue;
    // box: true = a mark without text (the beat dots): its whole box is checked like a text line
    const lines = c.box ? [map(c.el.getBoundingClientRect())].filter((b) => b.w > 0 && b.h > 0) : textLines(c.el, map);
    if (!lines.length) continue;
    texts.push({ el: c.el, lines, box: union(lines), name: `${c.name || 'chrome'} "${(c.el.textContent || '').trim().slice(0, 24)}"`, id: c.name || null, chrome: true });
  }
  const shapes = [];
  for (const el of section.querySelectorAll('.el.r, .el.e, .el.v, .el.img-panel, .img-gutter')) {
    if (!isShown(el)) continue;
    const box = map(el.getBoundingClientRect());
    if (box.w <= 0 || box.h <= 0) continue;
    shapes.push({ el, box, id: el.dataset.id || el.className, name: label(el) });
  }

  // 1. text vs text
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const A = texts[i], B = texts[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (!inter(A.box, B.box)) continue;
      let hit = null;
      for (const la of A.lines) { for (const lb of B.lines) { hit = inter(la, lb); if (hit) break; } if (hit) break; }
      if (hit) violations.push({ type: 'text-text', a: A.name, b: B.name, at: round(hit) });
    }
  }
  // 2. text vs shape (non-container)
  for (const T of texts) {
    for (const S of shapes) {
      if (S.el.contains(T.el)) continue; // structural container (image panel)
      let hit = null;
      for (const l of T.lines) { hit = inter(l, S.box); if (hit) break; }
      if (!hit) continue;
      if (contains(S.box, T.box)) continue; // the text deliberately sits inside the shape
      if (allow.includes(`${S.id}|${T.id}`)) continue;
      violations.push({ type: 'text-shape', text: T.name, shape: S.name, at: round(hit) });
    }
  }
  // 3. outside the stage
  for (const T of texts) {
    const b = T.box;
    if (b.x < -EPS || b.y < -EPS || b.x + b.w > 1920 + EPS || b.y + b.h > 1080 + EPS) violations.push({ type: 'outside-stage', el: T.name, box: round(b) });
  }
  for (const S of shapes) {
    const b = S.box;
    if (b.x < -EPS || b.y < -EPS || b.x + b.w > 1920 + EPS || b.y + b.h > 1080 + EPS) violations.push({ type: 'outside-stage', el: S.name, box: round(b) });
  }
  // 4. appendix overflow
  for (const body of section.querySelectorAll('.refs-body')) {
    if (body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1) {
      violations.push({ type: 'overflow', el: 'refs-body', detail: `${body.scrollWidth}x${body.scrollHeight} > ${body.clientWidth}x${body.clientHeight}` });
    }
  }
  // 5. diagrams
  const diagrams = [];
  for (const d of info.diagrams) {
    const live = deck.host.isLive(d.id);
    const rec = { id: d.id, live, state: live ? deck.host.stateOf(d.id) : null, violations: [], labels: 0 };
    if (live) {
      // The diagram's own audit and its pixels depend only on its state: computed once per (id, state) per run.
      const ck = `${d.id}|${rec.state}`;
      let C = cache.get(ck);
      if (!C) {
        deck.host.renderOnce(d.id);
        C = { res: deck.host.audit(d.id) || { labels: [], violations: [] }, pixels: null };
        cache.set(ck, C);
      }
      const res = C.res;
      rec.labels = (res.labels || []).length;
      for (const v of res.violations || []) rec.violations.push(String(v));
      // diagram labels vs HTML text, and labels outside the region
      for (const L of res.labels || []) {
        const r = { x: d.region.x + L.rect.x, y: d.region.y + L.rect.y, w: L.rect.w, h: L.rect.h };
        if (r.x < d.region.x - EPS || r.y < d.region.y - EPS || r.x + r.w > d.region.x + d.region.w + EPS || r.y + r.h > d.region.y + d.region.h + EPS) {
          rec.violations.push(`label outside region: "${L.text}"`);
        }
        for (const T of texts) {
          if (d.slot.contains(T.el)) continue;
          for (const l of T.lines) {
            const hit = inter(l, r);
            if (hit) { rec.violations.push(`label "${L.text}" overlaps HTML ${T.name}`); break; }
          }
        }
      }
      // HTML text over rendered diagram pixels
      for (const T of texts) {
        if (d.slot.contains(T.el)) continue;
        for (const l of T.lines) {
          if (!inter(l, d.region)) continue;
          if (!C.pixels) { deck.host.renderOnce(d.id); C.pixels = readCanvases(d.slot, map); }
          const { count } = canvasInkCount(C.pixels, l);
          if (count > 6) { rec.violations.push(`HTML ${T.name} sits on ${count} px of diagram geometry`); break; }
        }
      }
    }
    for (const v of rec.violations) violations.push({ type: 'diagram', id: d.id, msg: v });
    diagrams.push(rec);
  }

  // info: red elements visible (locked rule: at most 2 per slide), reported, not a violation
  let red = 0;
  for (const T of texts) if (isRed(colorOf(T.el))) red++;
  for (const S of shapes) if (isRed(colorOf(S.el))) red++;

  return { key, index, beat: deck.visible() - 1, beats: info.beats, violations, diagrams, red, wrapMismatch };
}

function drawOverlay(deck, index, res) {
  const section = deck.sections[index];
  for (const old of section.querySelectorAll('.audit-box')) old.remove();
  for (const v of res.violations) {
    const r = v.at || v.box;
    if (!r) continue;
    const b = document.createElement('div');
    b.className = 'audit-box';
    b.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${Math.max(2, r.w)}px;height:${Math.max(2, r.h)}px;outline:2px solid #ff00aa;background:rgba(255,0,170,.15);z-index:100001;pointer-events:none`;
    section.appendChild(b);
  }
}

/** fontsOk: both probe styles report loaded after document.fonts.ready, and real Montserrat faces did load. */
export async function checkFonts() {
  const res = { fontsOk: false, check900: false, check400: false, faces: {} };
  if (typeof document === 'undefined' || !document.fonts) return res;
  try { await document.fonts.ready; } catch (e) { /* keep going */ }
  res.check900 = document.fonts.check('900 80px Montserrat');
  res.check400 = document.fonts.check('400 20px Montserrat');
  let loaded900 = false, loaded400 = false;
  try {
    for (const f of document.fonts) {
      if (!/montserrat/i.test(f.family)) continue;
      const k = String(f.weight);
      res.faces[k] = res.faces[k] ? res.faces[k] + ',' + f.status : f.status;
      if (f.status === 'loaded' && k === '900') loaded900 = true;
      if (f.status === 'loaded' && k === '400') loaded400 = true;
    }
  } catch (e) { /* FontFaceSet iteration unsupported */ }
  res.fontsOk = !!(res.check900 && res.check400 && loaded900 && loaded400);
  return res;
}

/** ?auditSlides=s05,s06,7,i03 limits ?audit=all to those slides (keys or content numbers), so it can run in chunks. */
function slideFilter(deck, only) {
  if (only == null) {
    try { only = new URLSearchParams(location.search).get('auditSlides'); } catch { only = null; }
  }
  if (!only) return null;
  const want = new Set(String(only).split(',').map((x) => x.trim()).filter(Boolean));
  const keep = new Set();
  for (let i = 0; i < deck.count; i++) {
    const inf = deck.info(i);
    if (want.has(inf.key) || (inf.n != null && want.has(String(inf.n)))) keep.add(i);
  }
  return keep;
}

// chrome(index) -> [{ el, name }]: visible stage chrome to audit with the slide (audience.js: the on-slide timer).
// onShow(index, beatsVisible): called after each slide is shown, so the caller can update that chrome first.
export async function runAudit({ deck, all = false, overlay = false, only = null, chrome = null, onShow = null } = {}) {
  const chromeAt = (i, n) => {
    try { if (onShow) onShow(i, n); return chrome ? chrome(i) || [] : []; } catch (e) { console.error("[audit] chrome hook failed", e); return []; }
  };
  await fontsReady();
  await nextFrame();
  const out = { mode: all ? 'all' : 'current', ok: true, violations: 0, slides: [], liveDiagrams: [], fallbackDiagrams: [], red: {} };
  const t0 = performance.now();
  if (all) {
    const keep = slideFilter(deck, only);
    if (keep) out.only = [...keep].map((i) => deck.keyAt(i));
    const cache = new Map();
    for (let i = 0; i < deck.count; i++) {
      if (keep && !keep.has(i)) continue;
      const beats = deck.beatsOf(i);
      for (let n = 1; n <= beats; n++) {
        await deck.show(i, n, { instant: true });
        const ch = chromeAt(i, n);
        await nextFrame();
        out.slides.push(auditCurrent(deck, i, cache, ch));
      }
      for (const k of [...cache.keys()]) if (!deck.info(i).diagrams.some((d) => k.startsWith(d.id + '|'))) cache.delete(k);
    }
  } else {
    await nextFrame();
    const i = deck.current();
    const res = auditCurrent(deck, i, new Map(), chromeAt(i, deck.visible()));
    out.slides.push(res);
    if (overlay) drawOverlay(deck, i, res);
  }
  const seen = new Set();
  for (const s of out.slides) {
    out.violations += s.violations.length;
    out.red[s.key] = Math.max(out.red[s.key] || 0, s.red);
    for (const d of s.diagrams) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      (d.live ? out.liveDiagrams : out.fallbackDiagrams).push(d.id);
    }
  }
  // Compact: drop clean entries from the per-beat list but keep a count.
  out.checked = out.slides.length;
  const wraps = new Map();
  for (const s of out.slides) for (const w of s.wrapMismatch || []) wraps.set(`${s.key} ${w.el}`, { slide: s.key, ...w });
  out.wrapMismatch = [...wraps.values()];
  for (const s of out.slides) delete s.wrapMismatch;
  out.slides = out.slides.filter((s) => s.violations.length);
  const fonts = await checkFonts();
  out.fontsOk = fonts.fontsOk;
  out.fonts = fonts;
  const appendix = deck.sections.map((sec) => sec.querySelector('.refs-body')).find(Boolean);
  out.appendixFont = appendix && appendix.dataset.fit ? Number(appendix.dataset.fit) : null;
  out.runtimeErrors = runtimeErrors();
  out.blockedResources = blockedResources();
  out.overlapOk = out.violations === 0;
  out.ok = out.overlapOk && out.fontsOk && !out.runtimeErrors.length && !out.blockedResources.length;
  out.ms = Math.round(performance.now() - t0);
  writeResult(out);
  document.title = out.ok ? 'audit ok' : `audit: ${out.violations} overlap(s), fonts ${out.fontsOk ? 'ok' : 'NOT ok'}, ${out.runtimeErrors.length} error(s), ${out.blockedResources.length} blocked`;
  return out;
}
