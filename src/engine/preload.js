// preload.js - "are all the assets in the browser yet?" (user: "when a person enters the page add a loading circle
// bar that indicates that all the assets needed for the presentation have downloaded into the web browser").
//
//   createAssetLoader({ images, onProgress, timeoutMs }) -> { state(), ready, refs }
//     images     spec/images.json as inlined by build.mjs ({ pairs: [{ seoul:{file,present,...}, nyc:{...} }] })
//     onProgress (state) => void, called once at once and after every settled unit
//     state      { loaded, failed, total, ratio, done, failedNames[] }   ratio = settled / total (0..1)
//   Units: the Montserrat font faces count as ONE unit (document.fonts, same test as audit.js checkFonts), plus every
//   photo the deck shows (manifest sides with a real file: images.js imageUsable; user-supply sides without a file are
//   skipped). Each photo loads through new Image() + resolveImage(), and the Image objects are kept (refs) so the
//   browser keeps them cached for the talk. onload / onerror both settle a unit. A unit still pending after
//   timeoutMs (default 120 s) counts as failed, so the ring can never stay up for the whole talk.
//   dist/index.html: this measures the real download of assets/img/*.jpg. Seoul-Presentation.html: the photos are
//   inline data URIs, so it completes almost at once.
//
//   mountAssetRing({ loader?, images, params, view }) -> { el, loader, dispose() } | null
//   The audience view's ring: ~40 px circle fixed to the VIEWPORT bottom-left (20 px + safe area, outside the scaled
//   stage), pointer-events none, never takes focus. Track = hairline light grey; progress starts at 9 o'clock and runs
//   clockwise, the top half (9 to 3) in red #CD2E3A and the bottom half (3 back to 9) in blue #0047A0, so the finished
//   ring reads as the taegeuk, red over blue. Inside: the percent (Montserrat 600, ink, tabular numbers). Done: a
//   small check, held 1.2 s, then a 400 ms fade and removal; a failure shows "!" (failed names in the title) and
//   fades after 6 s. Reduced motion: no fade, just removed. <html data-assets="loading|ready|partial"> for tests.
//   Not shown in ?view=print, ?static=1, ?audit= runs or print media (CSS). ?loaderDemo=<0..1> freezes the ring at
//   that value for screenshots (1 = the finished ring with its check).
// No visible text here uses em or en dashes.

import { resolveImage, imageUsable } from './images.js';

const SIDES = ['seoul', 'nyc'];
const FONT_WEIGHTS = [300, 400, 500, 600, 700, 900];

/** Every photo file the deck shows, once each, in slide order. */
export function photoFiles(images) {
  const out = [];
  const seen = new Set();
  for (const p of (images && images.pairs) || []) {
    if (!p || p.placeholder) continue;
    for (const side of SIDES) {
      const e = p[side];
      if (!imageUsable(e)) continue;
      const f = String(e.file).replace(/^\.\//, '');
      if (seen.has(f)) continue;
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}

/** Montserrat loaded? Same rule as audit.js checkFonts (900 and 400 faces really loaded), after asking for every weight. */
async function fontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts) return true; // nothing to wait for
  try { await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 40px Montserrat`, 'AaBb0123'))); } catch { /* checked below */ }
  try { await document.fonts.ready; } catch { /* keep going */ }
  let ok900 = false;
  let ok400 = false;
  try {
    for (const f of document.fonts) {
      if (!/montserrat/i.test(f.family) || f.status !== 'loaded') continue;
      if (String(f.weight) === '900') ok900 = true;
      if (String(f.weight) === '400') ok400 = true;
    }
  } catch { /* FontFaceSet iteration unsupported: fall back to check() */ ok900 = ok400 = true; }
  return ok900 && ok400 && document.fonts.check('900 80px Montserrat') && document.fonts.check('400 20px Montserrat');
}

const baseName = (f) => String(f).split('/').pop();

export function createAssetLoader({ images = null, onProgress = null, timeoutMs = 120000, fonts = true } = {}) {
  const files = photoFiles(images);
  const total = files.length + (fonts ? 1 : 0);
  let loaded = 0;
  let failed = 0;
  const failedNames = [];
  const refs = []; // keep the Image objects: the browser keeps their bytes cached for the talk
  const listeners = new Set();
  if (typeof onProgress === 'function') listeners.add(onProgress);
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });

  const state = () => ({
    loaded, failed, total,
    ratio: total ? (loaded + failed) / total : 1,
    done: loaded + failed >= total,
    failedNames: failedNames.slice(),
  });
  const emit = () => {
    const st = state();
    for (const fn of [...listeners]) { try { fn(st); } catch (e) { console.error('[preload] onProgress', e); } }
    if (st.done) resolveReady(st);
  };
  const settle = (ok, name) => {
    if (ok) loaded += 1;
    else { failed += 1; failedNames.push(name); }
    emit();
  };
  /** One settle per unit, also when the timeout and a late load race. */
  const unit = (name) => {
    let open = true;
    const timer = timeoutMs > 0 ? setTimeout(() => { if (open) { open = false; settle(false, name); } }, timeoutMs) : 0;
    return (ok) => { if (!open) return; open = false; clearTimeout(timer); settle(ok, name); };
  };

  emit(); // 0 of N at once (or done at once when there is nothing to load)
  if (fonts) {
    const fin = unit('Montserrat font');
    fontsLoaded().then((ok) => fin(!!ok), () => fin(false));
  }
  for (const f of files) {
    const fin = unit(baseName(f));
    const img = new Image();
    refs.push(img);
    img.decoding = 'async';
    img.onload = () => fin(true);
    img.onerror = () => fin(false);
    try { img.src = resolveImage(f); } catch { fin(false); }
  }

  return {
    state,
    ready,
    refs,
    files,
    subscribe(fn) { if (typeof fn === 'function') { listeners.add(fn); fn(state()); } return () => listeners.delete(fn); },
  };
}

/** Short text for a checklist line or an aria-label: "18 of 29 files". */
export function assetCountText(st) {
  return `${st.loaded + st.failed} of ${st.total} files`;
}

// ------------------------------------------------------------------ the ring (audience view only)
const R = 17.25; // ring radius in a 40 x 40 box; stroke 3 sits inside the box
const C = 20;
const ARC_TOP = `M ${C - R} ${C} A ${R} ${R} 0 0 1 ${C + R} ${C}`; // 9 o'clock over 12 to 3 (clockwise)
const ARC_BOTTOM = `M ${C + R} ${C} A ${R} ${R} 0 0 1 ${C - R} ${C}`; // 3 o'clock under 6 back to 9
const ICON_CHECK = '<svg class="asset-ring__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HOLD_MS = 1200;
const FADE_MS = 400;
const FAIL_HOLD_MS = 6000;

export function ringHidden(params, view) {
  if (view === 'print') return true;
  if (!params) return false;
  return params.get('view') === 'print' || params.get('static') === '1' || params.has('audit');
}

function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

export function mountAssetRing({ loader = null, images = null, params = null, view = 'audience', parent = null } = {}) {
  if (typeof document === 'undefined' || ringHidden(params, view)) return null;
  const html = document.documentElement;
  const demoRaw = params ? params.get('loaderDemo') : null;
  const demoTotal = photoFiles(images).length + 1; // photos + the font unit
  const demo = demoRaw != null && demoRaw !== '' && Number.isFinite(Number(demoRaw)) ? Math.min(1, Math.max(0, Number(demoRaw))) : null;

  const el = document.createElement('div');
  el.className = 'asset-ring';
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.innerHTML = `
<svg class="asset-ring__svg" viewBox="0 0 40 40" aria-hidden="true">
  <circle class="asset-ring__track" cx="${C}" cy="${C}" r="${R}"/>
  <path class="asset-ring__arc asset-ring__arc--red" d="${ARC_TOP}" pathLength="1"/>
  <path class="asset-ring__arc asset-ring__arc--blue" d="${ARC_BOTTOM}" pathLength="1"/>
</svg>
<span class="asset-ring__label" aria-hidden="true"><span class="asset-ring__val"><span class="asset-ring__num">0</span><span class="asset-ring__pct">%</span></span></span>`;
  const red = el.querySelector('.asset-ring__arc--red');
  const blue = el.querySelector('.asset-ring__arc--blue');
  const label = el.querySelector('.asset-ring__label');
  (parent || document.body).appendChild(el);

  let lastPct = -1;
  let lastMode = '';
  let finishTimer = 0;
  let removed = false;

  function draw(ratio, mode, st) {
    const r = Math.min(1, Math.max(0, ratio));
    red.style.strokeDashoffset = String(1 - Math.min(1, r * 2));
    blue.style.strokeDashoffset = String(1 - Math.max(0, r * 2 - 1));
    const pct = mode === 'loading' ? Math.min(99, Math.floor(r * 100)) : 100;
    el.setAttribute('aria-valuenow', String(pct));
    const n = st ? st.loaded + st.failed : Math.round(r * demoTotal);
    const tot = st ? st.total : demoTotal;
    el.setAttribute('aria-label', mode === 'loading'
      ? `Loading presentation: ${n} of ${tot} files`
      : mode === 'partial' ? `Presentation loaded, ${st ? st.failed : 0} file(s) failed` : 'Presentation loaded');
    if (mode !== lastMode) {
      lastMode = mode;
      el.dataset.state = mode;
      if (mode === 'ready') label.innerHTML = ICON_CHECK;
      else if (mode === 'partial') label.innerHTML = '<span class="asset-ring__bang">!</span>';
      lastPct = -1;
    }
    if (mode === 'loading' && pct !== lastPct) {
      lastPct = pct;
      const num = label.querySelector('.asset-ring__num');
      if (num) num.textContent = String(pct);
    }
  }

  function remove() {
    if (removed) return;
    removed = true;
    clearTimeout(finishTimer);
    el.remove();
  }

  function finish(st) {
    const partial = st.failed > 0;
    html.dataset.assets = partial ? 'partial' : 'ready';
    if (partial) el.title = `Not loaded: ${st.failedNames.join(', ')}`;
    draw(1, partial ? 'partial' : 'ready', st);
    if (demo != null) return; // frozen for screenshots
    const hold = partial ? FAIL_HOLD_MS : HOLD_MS;
    finishTimer = setTimeout(() => {
      if (reducedMotion()) { remove(); return; }
      el.classList.add('is-leaving');
      finishTimer = setTimeout(remove, FADE_MS + 50);
    }, hold);
  }

  if (demo != null) {
    // frozen preview: the real loader is not needed for the picture
    html.dataset.assets = demo >= 1 ? 'ready' : 'loading';
    if (demo >= 1) draw(1, 'ready', null);
    else draw(demo, 'loading', { loaded: Math.round(demo * demoTotal), failed: 0, total: demoTotal });
    return { el, loader: null, dispose: remove };
  }

  html.dataset.assets = 'loading';
  const ld = loader || createAssetLoader({ images });
  let finished = false;
  const off = ld.subscribe((st) => {
    if (finished || removed) return;
    if (st.done) { finished = true; finish(st); return; }
    draw(st.ratio, 'loading', st);
  });
  return { el, loader: ld, dispose() { off(); remove(); } };
}
