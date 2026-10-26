// 1920x1080 logical stage, letterboxed inside `root` and scaled with a CSS transform (black bars around it).
// createStage(root, { fit }) -> { el, getScale, onResize(cb) -> off, fit(), destroy() }
//   root: any element (the window-filling .deck-root for the audience, a box in the presenter view).
//   fit:  'contain' (default, letterbox) | 'none' (no scaling, used by print).

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function createStage(root, { fit = 'contain', className = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'stage' + (className ? ' ' + className : '');
  root.appendChild(el);
  if (fit === 'contain') root.classList.add('stage-root');

  let scale = 1;
  const listeners = new Set();

  function measure() {
    if (fit !== 'contain') return 1;
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    return Math.max(0.01, Math.min(w / STAGE_W, h / STAGE_H));
  }

  function apply() {
    const next = measure();
    if (fit === 'contain') {
      const w = root.clientWidth || window.innerWidth;
      const h = root.clientHeight || window.innerHeight;
      const ox = Math.round((w - STAGE_W * next) / 2);
      const oy = Math.round((h - STAGE_H * next) / 2);
      el.style.transform = `translate(${ox}px, ${oy}px) scale(${next})`;
    } else {
      el.style.transform = 'none';
    }
    const changed = Math.abs(next - scale) > 1e-4;
    scale = next;
    if (changed) for (const cb of listeners) { try { cb(scale); } catch (e) { console.error(e); } }
  }

  let ro = null;
  if (fit === 'contain') {
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => apply());
      ro.observe(root);
    }
    window.addEventListener('resize', apply);
  }
  apply();

  return {
    el,
    getScale: () => scale,
    onResize(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    fit: apply,
    destroy() {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', apply);
      listeners.clear();
      el.remove();
    },
  };
}
