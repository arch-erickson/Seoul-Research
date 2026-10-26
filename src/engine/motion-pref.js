// motion-pref.js - ONE switch for all deck motion (2D motion.js, the 3D diagrams, CSS transitions).
//
// Why: Windows "Animation effects" off (Settings > Accessibility > Visual effects, common on lab PCs) makes Chrome and
// Edge report prefers-reduced-motion: reduce, which used to turn every count, arrival, line draw and 3D move into a
// snap. The talk is meant to animate, so the deck decides instead of the OS:
//
//   (default)     motion ON: every matchMedia query about prefers-reduced-motion answers "no preference"
//   ?motion=os    follow the OS / browser setting (the native matchMedia is left alone)
//   ?motion=off   force instant: those queries answer "reduce"
//   ?motion=on    motion on (same as the default; overrides the instant modes below)
//   ?play=1       motion on (headless motion checks, as before)
//   ?view=print, ?static=1, ?audit=...   instant (as before): the queries answer "reduce"
//
// Installed on import (frames.js imports it, errors.js imports frames.js, main.js imports errors.js first), so it runs
// before motion.js and src/kit3d evaluate. <html data-deck-motion="on|off"> drives the CSS (instead of
// @media (prefers-reduced-motion)). No text here uses em or en dashes.

const RE = /prefers-reduced-motion/i;

/** 'on' | 'off' | 'os' from the page URL. */
export function motionMode(search = (typeof location !== 'undefined' ? location.search : '')) {
  let p;
  try { p = new URLSearchParams(search); } catch { return 'on'; }
  const m = String(p.get('motion') || '').trim().toLowerCase();
  if (p.get('play') === '1') return 'on';
  if (m === 'os' || m === 'off' || m === 'on') return m;
  if (p.get('view') === 'print' || p.get('static') === '1' || p.has('audit')) return 'off';
  return 'on';
}

let nativeMatch = null;

function nativeReduce() {
  try { return !!(nativeMatch && nativeMatch('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

/** True when motion is off for this page (forced, or ?motion=os and the OS asks for reduced motion). */
export function motionOff() {
  const mode = motionMode();
  if (mode === 'os') return nativeReduce();
  return mode === 'off';
}

function fakeList(query, matches) {
  return {
    matches, media: String(query), onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent() { return false; },
  };
}

/** What a reduced-motion query answers when the deck decides: reduce = forced. */
export function answer(query, reduce) {
  const q = String(query).toLowerCase();
  if (/no-preference/.test(q)) return !reduce;
  return reduce; // "(prefers-reduced-motion: reduce)" and the bare "(prefers-reduced-motion)"
}

export function installMotionPref() {
  if (typeof window === 'undefined' || window.__seoulMotionPref) return;
  const mode = motionMode();
  if (typeof window.matchMedia === 'function') {
    nativeMatch = window.matchMedia.bind(window);
    if (mode !== 'os') {
      const reduce = mode === 'off';
      try {
        window.matchMedia = (q) => (RE.test(String(q)) ? fakeList(q, answer(q, reduce)) : nativeMatch(q));
      } catch { /* keep the native one */ }
    }
  }
  window.__seoulMotionPref = mode;
  const mark = () => {
    try { document.documentElement.dataset.deckMotion = motionOff() ? 'off' : 'on'; } catch { /* no document */ }
  };
  mark();
  if (mode === 'os' && nativeMatch) {
    try { nativeMatch('(prefers-reduced-motion: reduce)').addEventListener('change', mark); } catch { /* old browser */ }
  }
}

installMotionPref();
