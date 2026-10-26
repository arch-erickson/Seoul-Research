// Timer-driven animation frames for the two non-interactive modes: ?audit=1|all and ?view=print.
// Headless Chrome (shot.mjs --dom, --print-to-pdf with a virtual-time budget) never services requestAnimationFrame
// there, and a pending rAF stalls virtual time, so a diagram's render-on-demand loop or any awaited frame would
// freeze the page before it is ready. In these modes requestAnimationFrame becomes a 16 ms timer; everything else
// (the live audience and presenter views) keeps the real rAF.

// The prefers-reduced-motion answer (motion on by default, ?motion=os / ?motion=off, instant in print / static /
// audit; ?play=1 = motion on) is decided by motion-pref.js, installed here so it runs before motion.js and src/kit3d.
import './motion-pref.js';

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
