// overlay-timer.js - the minimal on-slide timer from the Figma deck (top-right of every content slide):
//
//              1:30        <- this slide's time: starts at its planned duration and counts down
//   07    ends 2:15        <- slide number / deck-clock time this slide should end (planned)
//   ====|##|---------      <- 290 x 2 px deck track: elapsed part in rule grey, this slide's planned
//                             segment as a 5 px red bar
//
// Shown only when no presenter window is connected (single screen) or when toggled with O. Never in print
// (?view=print / body[data-view=print] / the browser's print media). Hidden on image interstitials
// (full-bleed photos), on the untimed appendix and while the screen is black or white, so it never sits on
// top of an image or text it does not belong to. Lives inside the 1920x1080 stage (stage px).

const C = { ink: '#111112', muted: '#6B6D70', rule: '#DBDAD7', faint: '#EDEDEA', red: '#CD2E3A' };
const BOX = { right: 100, top: 40, w: 290 }; // stage px; right edge at x = 1820 (100 px margin)

/** True in the PDF / print view: the overlay must never appear there. */
export function isPrintView() {
  try {
    if (typeof document !== 'undefined' && document.body && document.body.dataset.view === 'print') return true;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'print') return true;
  } catch { /* ignore */ }
  return false;
}

let printStyled = false;
function ensurePrintRule() {
  if (printStyled || typeof document === 'undefined' || !document.head) return;
  printStyled = true;
  const st = document.createElement('style');
  st.textContent = '@media print{.overlay-timer{display:none!important}}';
  document.head.appendChild(st);
}

export function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Planned schedule from spec/timing.json: [{ key, kind, n, dur, start, end }] in seconds + total. */
export function planFromTiming(timing) {
  const order = (timing && timing.order) || [];
  let t = 0;
  const rows = order.map((s) => {
    const dur = Number(s.dur) || 0;
    const row = { key: s.key, kind: s.kind, n: s.n, title: s.title || '', dur, start: t, end: t + dur, cues: (s.beats || []).map((b) => Number(b.cue) || 0), beats: s.beats || [] };
    t += dur;
    return row;
  });
  return { rows, total: Number(timing && timing.totalSeconds) || t };
}

function el(tag, style, text) {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  return e;
}

/**
 * createOverlayTimer(stageEl) -> { el, update(state, timing, opts), toggle(), setVisible(v), setPresenterConnected(b), isVisible(), dispose() }
 * update(state, timing, { presenterConnected, black }):
 *   state = store snapshot (state.js): cur, timer.globalMs, timer.slideMs[], black/white, overlay.
 *   Visibility: automatic = shown while no presenter window is connected. The O key flips it: either let
 *   the store handle O (state.js `toggleOverlay`; every change of state.overlay is read as one flip) or
 *   call toggle() yourself - not both, or the two flips cancel out.
 */
export function createOverlayTimer(stageEl) {
  const root = el('div', {
    position: 'absolute', left: `${1920 - BOX.right - BOX.w}px`, top: `${BOX.top}px`, width: `${BOX.w}px`, height: '56px',
    zIndex: '60', pointerEvents: 'none', fontFamily: 'Montserrat, system-ui, sans-serif', color: C.ink,
    opacity: '0', transition: 'opacity 300ms ease-out', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum" 1',
  });
  root.className = 'overlay-timer';
  root.setAttribute('aria-hidden', 'true');

  const dur = el('div', { position: 'absolute', right: '0', top: '0', fontSize: '19px', fontWeight: '600', lineHeight: '23px', letterSpacing: '0', whiteSpace: 'nowrap' });
  dur.className = 'overlay-timer__dur';
  const ends = el('div', { position: 'absolute', right: '0', top: '27px', fontSize: '13px', fontWeight: '500', lineHeight: '16px', color: C.muted, whiteSpace: 'nowrap', textAlign: 'right' });
  ends.className = 'overlay-timer__ends';
  const num = el('div', { position: 'absolute', left: '0', top: '27px', fontSize: '13px', fontWeight: '600', lineHeight: '16px', color: C.muted, letterSpacing: '0.06em', whiteSpace: 'nowrap' });
  num.className = 'overlay-timer__num';
  const track = el('div', { position: 'absolute', left: '0', top: '52px', width: `${BOX.w}px`, height: '2px', background: C.faint });
  track.className = 'overlay-timer__track';
  const done = el('div', { position: 'absolute', left: '0', top: '0', height: '2px', width: '0px', background: C.rule });
  const seg = el('div', { position: 'absolute', top: '-1.5px', height: '5px', width: '0px', left: '0px', background: C.red });
  track.append(done, seg);
  root.append(dur, ends, num, track);
  stageEl.appendChild(root);
  ensurePrintRule();

  let manual = null;            // O-key override: null = automatic
  let presenterConnected = false;
  let shown = false;
  let planCache = null, planFor = null;
  let last = {};
  let lastEligible = false;
  let lastOverlayFlag;           // last seen state.overlay (undefined until the first update)

  const setShown = (v) => {
    if (v === shown) return;
    shown = v;
    root.style.opacity = v ? '1' : '0';
    root.style.visibility = v ? 'visible' : 'hidden';
  };
  root.style.visibility = 'hidden';

  const wanted = () => (manual !== null ? manual : !presenterConnected);

  function update(state, timing, opts = {}) {
    if (!state || !timing) return;
    if (opts.presenterConnected !== undefined) api.setPresenterConnected(!!opts.presenterConnected);
    if (typeof state.overlay === 'boolean') {
      if (lastOverlayFlag !== undefined && state.overlay !== lastOverlayFlag) manual = !wanted(); // O pressed
      lastOverlayFlag = state.overlay;
    }
    if (planFor !== timing) { planCache = planFromTiming(timing); planFor = timing; }
    const { rows, total } = planCache;
    const i = state.cur | 0;
    const row = rows[i];
    const black = !!(opts.black || state.black || state.white);
    const eligible = !!row && row.kind === 'content' && row.dur > 0 && !black && !isPrintView();
    lastEligible = eligible;
    setShown(eligible && wanted());
    if (!eligible) return;

    const timer = state.timer || {};
    const slideMs = (timer.slideMs && timer.slideMs[i]) || 0;
    const globalMs = timer.globalMs || 0;
    const remain = row.dur * 1000 - slideMs;
    const durText = remain >= 0 ? fmt(Math.ceil(remain / 1000)) : `+${fmt(Math.floor(-remain / 1000))}`;
    const numText = row.n != null ? String(row.n).padStart(2, '0') : '';
    const endsText = `ends ${fmt(row.end)}`;
    const doneW = Math.round(Math.min(1, Math.max(0, globalMs / 1000 / total)) * BOX.w);
    const segL = Math.round((row.start / total) * BOX.w);
    const segW = Math.max(2, Math.round((row.dur / total) * BOX.w));

    if (last.dur !== durText) dur.textContent = durText;
    if (last.num !== numText) num.textContent = numText;
    if (last.ends !== endsText) ends.textContent = endsText;
    if (last.doneW !== doneW) done.style.width = `${doneW}px`;
    if (last.segL !== segL) seg.style.left = `${segL}px`;
    if (last.segW !== segW) seg.style.width = `${segW}px`;
    last = { dur: durText, num: numText, ends: endsText, doneW, segL, segW };
  }

  const api = {
    el: root,
    update,
    /** O key: flip whatever is showing now (sticks until the presenter window connects/disconnects). */
    toggle() { manual = !wanted(); setShown(lastEligible && wanted()); return manual; },
    setVisible(v) { manual = v === null || v === undefined ? null : !!v; setShown(lastEligible && wanted()); },
    setPresenterConnected(b) {
      if (b === presenterConnected) return;
      presenterConnected = b;
      manual = null; // a (dis)connecting presenter window resets the O override
    },
    isVisible: () => shown,
    dispose() { root.remove(); },
  };
  return api;
}
