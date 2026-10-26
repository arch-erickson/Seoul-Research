// audience.js - the slides window (default view): the state LEADER (ARCHITECTURE.md sections 3 and 4).
//
//   bootAudience({ data, params }) -> Promise<api>
//     data   = { slidesSpec, timing, images, references, diagrams, copy?, notesV2? } (main.js: data.generated.js + diagrams)
//     params = URLSearchParams of this page
//
// What it owns
//   - the store (state.js), ticked ~10x/s; every snapshot is rendered here and broadcast to the presenter window
//   - the 1920x1080 stage (stage.js) and the deck (slides.js); slides.js mounts the 3D diagrams of the current
//     slide (plus the next one, pre-mounted) through diagrams.js and disposes every other instance
//   - keys (input.js) and the presenter link (sync.js): the presenter only sends commands, this window decides
//   - P / Shift+P / F (screens.js): second-screen detection, fullscreen on the projector, the presenter popup
//   - the on-slide timer (overlay-timer.js): shown only while no presenter window is connected (or toggled with O)
//   - black / white screen, the ? help card, the G go-to prompt, an idle mouse cursor that hides itself
//   - reload safety: the snapshot is kept in sessionStorage and restored on reload; a presenter that followed an
//     earlier slides window hands its last snapshot over (sync.shouldRestore). A full reset (back / Home to slide 1,
//     see state.js) is saved like any other state, so a reload after it stays reset.
//   - the asset loading ring (preload.js): fonts + every photo, bottom-left of the viewport, gone once all loaded
//     (not in static / audit runs; ?loaderDemo=<0..1> freezes it for screenshots)
//
// URL params: ?slide=<n|key>&beat=<k|last>&static=1 (jump, no animation, no timer, no presenter link; the on-slide
// timer stays hidden unless &timer=1), ?audit=1|all (+ auditSlides, overlay=1: the overlap audit; the on-slide timer
// is shown as in a single-screen talk and audited with every slide), ?simulateScreens=2 (+ simulateWM=0) for tests.
// Runtime errors are captured by errors.js (imported first by main.js) and reported by the audit.
// ?play=1 (test only, headless motion checks): the first slide shown after load plays its entry and builds instead of
// appearing at once (frames.js then drives the animation frames with timers, so a short --wait catches mid-motion).
// No text added here uses em or en dashes.

import { createStage } from './stage.js';
import { buildDeck, fontsReady } from './slides.js';
import { finishAll } from './motion.js';
import { createStore, slidesFromTiming } from './state.js';
import { bindKeys, bindWheel } from './input.js';
import { createSync, createCommandRouter, shouldRestore, saveSnapshot, loadSnapshot } from './sync.js';
import { createScreenController } from './screens.js';
import { createOverlayTimer } from './overlay-timer.js';
import { runAudit } from './audit.js';
import { mountAssetRing } from './preload.js';

export const TICK_MS = 100;
const SAVE_EVERY_MS = 1000;
const CURSOR_IDLE_MS = 2500;
const WAKE_RETRY_MS = 30000;

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** ?slide=7 (content slide number), ?slide=s07 / i03 / refs (key) -> index, or -1. */
export function slideIndexFromParam(slides, v) {
  if (v == null || v === '') return -1;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return slides.findIndex((x) => x.n === Number(s));
  return slides.findIndex((x) => x.key === s);
}

/** ?beat=<k> (0-based), 'last' / 'all' = fully built. Clamped to the slide's beats. */
export function beatFromParam(slide, v) {
  const last = Math.max(0, ((slide && slide.cues) || [0]).length - 1);
  if (v === 'all' || v === 'last') return last;
  const n = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(last, n));
}

// ------------------------------------------------------------------ help card and go-to prompt (outside the stage)
const KEYS_HELP = [
  ['<kbd>Right</kbd> <kbd>Space</kbd> <kbd>Enter</kbd> <kbd>PgDn</kbd>', 'Next beat or next slide. After going back, the first press only resumes the timer.'],
  ['<kbd>Left</kbd> <kbd>PgUp</kbd> <kbd>Backspace</kbd>', 'Back. Leaving a slide backwards pauses the timer.'],
  ['<kbd>Shift</kbd>+<kbd>Right</kbd> or <kbd>N</kbd>', 'Skip the remaining beats, go to the next slide'],
  ['<kbd>P</kbd>', 'Present: slides on the projector, presenter view on the laptop'],
  ['<kbd>Shift</kbd>+<kbd>P</kbd>', 'Open the presenter view (notes and timers)'],
  ['<kbd>F</kbd>', 'Fullscreen on or off'],
  ['<kbd>T</kbd> / <kbd>Shift</kbd>+<kbd>T</kbd>', 'Pause or resume the timer / reset it'],
  ['<kbd>A</kbd>', 'Auto-beats on or off'],
  ['<kbd>B</kbd> <kbd>W</kbd>', 'Black or white screen'],
  ['<kbd>O</kbd>', 'On-slide timer on or off'],
  ['<kbd>G</kbd> number <kbd>Enter</kbd>', 'Go to slide number'],
  ['<kbd>Home</kbd> <kbd>End</kbd>', 'First or last slide'],
  ['<kbd>Win</kbd>+<kbd>P</kbd>', 'Windows display mode. Choose Extend to keep notes on the laptop and slides on the projector.'],
];

function buildChrome(root) {
  const blank = h('div', 'aud-blank');
  blank.setAttribute('aria-hidden', 'true');
  const help = h('div', 'aud-help', `
<div class="aud-help-card" role="dialog" aria-label="Keyboard shortcuts">
  <div class="aud-help-title">Keyboard</div>
  <dl>${KEYS_HELP.map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('')}</dl>
  <div class="aud-help-foot">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</div>
</div>`);
  help.hidden = true;
  const gotoBox = h('div', 'aud-goto', '<span class="aud-goto-k">Go to slide</span><span class="aud-goto-v"></span>');
  gotoBox.hidden = true;
  root.append(blank, help, gotoBox);
  return { blank, help, gotoBox, gotoV: gotoBox.querySelector('.aud-goto-v') };
}

// ------------------------------------------------------------------ boot
export async function bootAudience({ data, params = new URLSearchParams(location.search) } = {}) {
  if (!data || !data.slidesSpec || !data.timing) throw new Error('bootAudience: data.slidesSpec and data.timing are required');
  document.documentElement.dataset.view = 'audience';
  document.body.dataset.view = 'audience';

  const auditMode = params.get('audit'); // '1' | 'all' | null
  const isStatic = params.get('static') === '1' || !!auditMode;
  const jumpIndexParam = params.get('slide');
  // first, so the photos start downloading while the deck is built (hidden in static / audit / print)
  const assets = mountAssetRing({ images: data.images, params, view: 'audience' });

  // ---------------- stage + deck
  const root = h('div', 'deck-root');
  document.body.appendChild(root);
  const stage = createStage(root);
  await fontsReady(); // measure and lay out with Montserrat (inlined as base64, so this is quick)
  // play=1 (headless check): 2D motion on, 3D diagrams instant (their continuous frames would stall virtual time).
  const playMode = params.get('play') === '1' && !isStatic;
  const deck = buildDeck(stage.el, { ...data, view: 'audience', getScale: stage.getScale, reducedMotion: isStatic || playMode || undefined,
    ...(playMode ? { motion: true } : {}) });
  stage.onResize(() => deck.host.refreshPixelRatio());
  const overlay = createOverlayTimer(stage.el);
  if (auditMode) overlay.setVisible(true); // audited as in a single-screen talk
  else if (isStatic && params.get('timer') !== '1') overlay.setVisible(false); // clean screenshots
  const chrome = buildChrome(root);

  // ---------------- store
  const slides = slidesFromTiming(data.timing);
  const store = createStore({ slides });
  let restoredFrom = null; // 'session' (reload) | 'presenter' (hand-over from a presenter window) | null
  const jumpIndex = slideIndexFromParam(slides, jumpIndexParam);
  if (jumpIndex >= 0) {
    store.dispatch({ type: 'jump', index: jumpIndex, beat: beatFromParam(slides[jumpIndex], params.get('beat')) });
  } else if (!isStatic) {
    // reload mid-talk: continue where the talk was (sessionStorage is per tab, so a fresh window starts clean)
    const saved = loadSnapshot();
    if (saved && saved.state) {
      const st = store.dispatch({ type: 'restore', state: saved.state, gapMs: Math.max(0, Date.now() - (saved.savedAt || Date.now())) });
      if (st.nav.type === 'restore') restoredFrom = 'session';
    }
  }

  // ---------------- ui extras broadcast to the presenter
  let keySeq = 0;
  let lastKey = '';
  let clickerTested = false; // a back press from a clicker in mouse-wheel mode (no key to report)
  let peers = 0;
  let ctrl = null;
  let sync = null;
  const uiExtras = () => ({ ...(ctrl ? ctrl.uiState() : {}), overlay: overlay.isVisible(), keySeq, lastKey, clickerTested });

  // ---------------- render
  let shownSeq = -1;
  let showing = Promise.resolve();
  let playFirst = params.get('play') === '1' && !isStatic;
  // Printing from the audience window: every running 2D motion jumps to its final state first.
  window.addEventListener('beforeprint', () => finishAll());
  let blankMode = null;
  let savedAt = 0;
  let savedSig = '';

  function setBlank(mode) {
    if (mode === blankMode) return;
    blankMode = mode;
    if (mode) chrome.blank.dataset.mode = mode; // keep the colour while it fades out
    chrome.blank.classList.toggle('is-on', !!mode);
  }

  function persist(st) {
    if (isStatic) return;
    // at once when the place or a mode changes, else at most once a second
    const t = Date.now();
    const sig = [st.nav.seq, st.cur, st.beat, st.started, st.timer.running, st.timer.pausedByBack, st.autoBeats, st.black, st.white, st.overlay].join('|');
    if (sig === savedSig && t - savedAt < SAVE_EVERY_MS) return;
    savedSig = sig;
    savedAt = t;
    // Every state is saved, the pristine one after a full reset (back / Home to slide 1) too, so a reload keeps it.
    saveSnapshot(st, uiExtras());
  }

  function render(st) {
    if (!st) return;
    if (st.nav.seq !== shownSeq) {
      shownSeq = st.nav.seq;
      showing = deck.show(st.cur, st.beatsVisible, { instant: isStatic || (!!st.nav.instant && !playFirst) });
      playFirst = false;
    }
    overlay.update(st, data.timing, { presenterConnected: peers > 0 });
    deck.countdown(st.cur, st.timer && st.timer.slideMs ? st.timer.slideMs[st.cur] : 0); // qa slide only
    setBlank(st.black ? 'black' : st.white ? 'white' : null);
    if (st.started) keepAwake();
    if (sync) sync.broadcast(st, uiExtras());
    persist(st);
  }

  // ---------------- screen wake lock while the talk runs (a sleeping laptop would blank the projector)
  let wakeLock = null;
  let wakePending = false;
  let wakeRetryAt = 0; // after a refusal, try again only every 30 s instead of on every tick
  async function keepAwake() {
    if (wakeLock || wakePending || isStatic || Date.now() < wakeRetryAt) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    wakePending = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
      wakeRetryAt = Date.now() + WAKE_RETRY_MS;
    } finally { wakePending = false; }
  }
  document.addEventListener('visibilitychange', () => { wakeRetryAt = 0; if (store.getState().started) keepAwake(); });

  // ---------------- help + go-to prompt
  function toggleHelp(force) {
    const open = force !== undefined ? !!force : chrome.help.hidden;
    chrome.help.hidden = !open;
  }
  const gotoShow = (text) => {
    chrome.gotoBox.hidden = text == null;
    chrome.gotoV.textContent = text || '_';
  };
  chrome.help.addEventListener('click', () => toggleHelp(false));

  // ---------------- presenter link + screens (not in the static / audit modes: those are for screenshots)
  if (!isStatic) {
    sync = createSync({
      role: 'audience',
      getSnapshot: () => ({ state: store.getState(), ui: uiExtras() }),
      onPeers: (n) => { peers = n; render(store.getState()); },
      onHello: (body, meta) => {
        if (shouldRestore(store.getState(), body && body.lastState)) {
          // the time since the old leader took that snapshot keeps counting (lastAt; else the hello time)
          const since = Number.isFinite(body.lastAt) ? body.lastAt : (meta && meta.sentAt) || Date.now();
          store.dispatch({ type: 'restore', state: body.lastState, gapMs: Math.max(0, Date.now() - since) });
          restoredFrom = 'presenter';
        }
      },
      // A message from the presenter is a cheap wake-up: keeps auto-beats on time if this window's timers are throttled.
      onActivity: () => store.tick(),
      onCommand: createCommandRouter({
        dispatch: (a) => store.dispatch(a),
        keyTarget: document.body,
        handlers: {
          present: () => { if (ctrl) ctrl.present(); },
          fullscreen: () => { if (ctrl) ctrl.toggleFullscreen(); },
          openPresenter: () => { if (ctrl) ctrl.openPresenter(); },
          help: () => { toggleHelp(); },
        },
      }),
    });
    ctrl = createScreenController({ sync, onChange: () => render(store.getState()) });
  }

  // ---------------- keys
  // Counted before the deck handles them, so the presenter's "Test the clicker" item sees keys pressed here too.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    keySeq += 1;
    lastKey = e.key;
  }, true);
  bindKeys(window, (a) => store.dispatch(a), {
    present: () => { if (ctrl) ctrl.present(); },
    openPresenter: () => { if (ctrl) ctrl.openPresenter(); },
    fullscreen: () => { if (ctrl) ctrl.toggleFullscreen(); },
    help: () => toggleHelp(),
    escape: () => { toggleHelp(false); gotoShow(null); },
    gotoPrompt: (text) => gotoShow(text),
  });

  // Clicker in mouse-wheel mode (Norwii N27 mode 3): one notch = next / back, bursts debounced by input.js.
  if (!isStatic) {
    bindWheel(window, (a) => {
      if (a && a.type === 'prev') clickerTested = true;
      store.dispatch(a);
    }, { ignore: (e) => !chrome.help.hidden && chrome.help.contains(e.target) });
  }

  store.subscribe(render);
  render(store.getState());
  const tickTimer = isStatic ? 0 : setInterval(() => store.tick(), TICK_MS);

  // ---------------- idle cursor (hidden after a moment without mouse movement)
  let idleTimer = 0;
  const html = document.documentElement;
  const wakeCursor = () => {
    html.classList.remove('cursor-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => html.classList.add('cursor-idle'), CURSOR_IDLE_MS);
  };
  if (!isStatic) {
    window.addEventListener('mousemove', wakeCursor, { passive: true });
    window.addEventListener('mousedown', wakeCursor, { passive: true });
    wakeCursor();
  }

  const api = {
    deck, store, sync, ctrl, overlay, stage, assets,
    ui: uiExtras,
    ready: showing,
    get restoredFrom() { return restoredFrom; },
    dispose() {
      clearInterval(tickTimer);
      clearTimeout(idleTimer);
      if (ctrl) ctrl.stop();
      if (sync) sync.close();
      if (assets) assets.dispose();
      deck.dispose();
    },
  };
  window.__seoulAudience = api;

  await showing;
  if (auditMode) {
    // The on-slide timer is audited with every slide it would sit on (content slides only, see overlay-timer.js).
    const base = store.getState();
    const timerTexts = () => (overlay.isVisible() ? [...overlay.el.children].filter((c) => (c.textContent || '').trim()).map((el) => ({ el, name: 'overlay-timer' })) : []);
    await runAudit({
      deck,
      all: auditMode === 'all',
      overlay: params.get('overlay') === '1',
      onShow: (i) => overlay.update({ ...base, cur: i, black: false, white: false }, data.timing, { presenterConnected: false }),
      chrome: timerTexts,
    });
  }
  return api;
}
