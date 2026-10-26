// beat-dots.js - the click dots (user request): one dot per forward press left on the current slide before the next
// press moves to the next slide, i.e. beats minus 1 (beat 0 shows on entry). Red #CD2E3A = not shown yet, blue
// #0047A0 = shown. Each press turns the next dot blue, Back turns the last blue dot red again, a revisited slide
// (shown fully built) has every dot blue, and a one-beat slide shows no dots.
// Used above the on-slide timer (overlay-timer.js, stage px) and above the presenter's slide timer (presenter.js).
// No text here uses em or en dashes.

import { motionOff } from './motion-pref.js';

export const DOT_RED = '#CD2E3A';
export const DOT_BLUE = '#0047A0';

/** { total, shown } for a store snapshot on a slide with `beatCount` beats. */
export function dotCounts(state, beatCount) {
  const total = Math.max(0, (beatCount | 0) - 1);
  let vis = 0;
  if (state) vis = Number.isFinite(state.beatsVisible) ? state.beatsVisible - 1 : (state.beat | 0);
  return { total, shown: Math.max(0, Math.min(total, vis)) };
}

export const dotsLabel = (total, shown) => (total > 0 ? `${shown} of ${total} points shown` : '');

/** createBeatDots({ size, gap, style, className }) -> { el, update(total, shown) } */
export function createBeatDots({ size = 11, gap = 8, style = {}, className = 'beat-dots' } = {}) {
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: `${gap}px`, height: `${size}px`,
    pointerEvents: 'none', lineHeight: '0',
  }, style);
  let lastTotal = -1;
  let lastShown = -1;
  function update(total, shown) {
    total = Math.max(0, total | 0);
    shown = Math.max(0, Math.min(total, shown | 0));
    if (total === lastTotal && shown === lastShown) return;
    const ease = motionOff() ? 'none' : 'background-color 220ms ease-out';
    if (total !== lastTotal) {
      el.replaceChildren();
      for (let k = 0; k < total; k++) {
        const d = document.createElement('span');
        d.className = 'beat-dot';
        Object.assign(d.style, {
          display: 'block', width: `${size}px`, height: `${size}px`, borderRadius: '50%', flex: '0 0 auto',
          background: k < shown ? DOT_BLUE : DOT_RED, transition: 'none',
        });
        el.appendChild(d);
      }
    } else {
      [...el.children].forEach((d, k) => {
        d.style.transition = ease;
        d.style.background = k < shown ? DOT_BLUE : DOT_RED;
      });
    }
    [...el.children].forEach((d, k) => { d.dataset.on = k < shown ? '1' : '0'; });
    lastTotal = total;
    lastShown = shown;
    if (total > 0) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', dotsLabel(total, shown));
      el.title = dotsLabel(total, shown);
    } else {
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      el.removeAttribute('title');
    }
  }
  return { el, update };
}
