// Timer-driven animation frames for the two non-interactive modes: ?audit=1|all and ?view=print.
// Headless Chrome (shot.mjs --dom, --print-to-pdf with a virtual-time budget) never services requestAnimationFrame
// there, and a pending rAF stalls virtual time, so a diagram's render-on-demand loop or any awaited frame would
// freeze the page before it is ready. In these modes requestAnimationFrame becomes a 16 ms timer; everything else
// (the live audience and presenter views) keeps the real rAF.

export function installTimerFrames() {
  if (typeof window === 'undefined' || window.__seoulTimerFrames) return;
  window.__seoulTimerFrames = true;
  const ids = new Map();
  let seq = 0;
  window.requestAnimationFrame = (cb) => {
    const id = ++seq;
    ids.set(id, setTimeout(() => { ids.delete(id); cb(performance.now()); }, 16));
    return id;
  };
  window.cancelAnimationFrame = (id) => { const t = ids.get(id); if (t !== undefined) { clearTimeout(t); ids.delete(id); } };
}

export function wantsTimerFrames(search = (typeof location !== 'undefined' ? location.search : '')) {
  try {
    const p = new URLSearchParams(search);
    return p.has('audit') || p.get('view') === 'print' || p.get('play') === '1'; // play=1: headless motion checks
  } catch { return false; }
}

if (wantsTimerFrames()) installTimerFrames();

// ?play=1 (headless motion checks only): this machine may report prefers-reduced-motion, which makes every 2D motion
// instant (motion.js reads it once on import, after this module). Like the Codex demo's preview adapter, play=1
// answers "no preference" so the check sees the real interpolation. Normal views keep the native preference.
try {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && new URLSearchParams(location.search).get('play') === '1') {
    const native = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      const m = native(q);
      if (!/prefers-reduced-motion/.test(String(q))) return m;
      return { matches: false, media: m.media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
    };
  }
} catch { /* keep the native preference */ }
