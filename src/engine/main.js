// main.js - the single entry of the deck. scripts/build.mjs bundles it (esbuild, iife, global SeoulDeck) into ONE
// inline classic script, so the same page works from the live https link and from a double-clicked file.
//
// One page, three views (URL param `view`):
//   (none) or audience   the slides window, state leader              -> audience.js bootAudience()
//   presenter            notes, timers, previews; opened by P/Shift+P -> presenter.js bootPresenter()
//   print                every slide fully built, one per page (PDF)  -> print.js bootPrint()
// Other params are read by the views: slide, beat, static, audit (+ auditSlides, overlay), simulateScreens,
// simulateWM, and the presenter's demo params (slideSec, globalSec, paused, auto, black, furthest).

import './errors.js'; // first: runtime-error and blocked-resource capture for the audit (also installs frames.js)
import DATA from './data.generated.js';
import DIAGRAMS from './diagrams.generated.js';
import { bootAudience } from './audience.js';
import { bootPresenter } from './presenter.js';
import { bootPrint } from './print.js';

const VIEWS = new Set(['audience', 'presenter', 'print']);

export const params = new URLSearchParams(location.search);
const asked = (params.get('view') || 'audience').trim().toLowerCase();
export const view = VIEWS.has(asked) ? asked : 'audience';
export const data = { ...DATA, diagrams: DIAGRAMS };
globalThis.__SEOUL_DECK_DATA__ = data; // presenter.js reads it too

function fail(e) {
  console.error('[deck] failed to start', e);
  const box = document.createElement('pre');
  box.className = 'deck-fail';
  box.textContent = `The presentation could not start (${view} view).\n\n${(e && (e.stack || e.message)) || e}`;
  (document.body || document.documentElement).appendChild(box);
}

function boot() {
  if (view === 'print') return bootPrint({ data });
  if (view === 'presenter') return bootPresenter({ data });
  return bootAudience({ data, params });
}

export let ready;
try {
  ready = Promise.resolve(boot());
  ready.catch(fail);
} catch (e) {
  fail(e);
  ready = Promise.reject(e);
  ready.catch(() => {});
}
