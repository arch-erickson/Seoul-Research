/**
 * Seoul deck - keyboard and presentation-clicker bindings (ARCHITECTURE.md section 3).
 *
 *   const unbind = bindKeys(window, store.dispatch, {
 *     present, openPresenter, fullscreen, help, escape,
 *     gotoPrompt(text) { ... },   // '' when G is pressed, then the digits typed so far; null = hide
 *   });
 *
 * Key map
 *   next        Right, Down, Space, Enter, PageDown          (clickers send PageDown or Right)
 *   prev        Left, Up, PageUp, Backspace, Shift+Space     (clickers send PageUp or Left)
 *   nextSlide   Shift+Right, N          prevSlide  Shift+Left
 *   first/last  Home / End
 *   T toggle timer, Shift+T reset timer, A auto-beats, O on-slide timer overlay
 *   B or . black screen, W or , white screen (clicker "blank" buttons send B or .)
 *   P present (hook + start the timer), F5 / Shift+F5 same (clicker "slideshow" button; also stops
 *   an accidental page reload mid-talk), Shift+P presenter window, F fullscreen, ? help,
 *   Esc close overlays (hook) + clear black/white, G digits Enter = go to content slide n.
 *
 *   Tab = toggle timer (the Norwii N27 hyperlink button; its double press sends Enter = next, and its
 *   long press sends Alt+Tab, which is left to Windows for switching between the deck windows).
 *
 * Norwii N27 (the user's clicker), native buttons, no software needed: holding both page buttons
 * cycles four modes and the clicker remembers the last one, so every mode is supported:
 *   Left/Right arrows (default) · Page Up/Page Down · mouse scroll wheel (see bindWheel) · Up/Down arrows.
 *   Long press Page Up = start slideshow (F5 or Shift+F5: presents, never reloads); long press again = Esc.
 *   Long press Page Down = black screen (B or .). Laser and volume keys need nothing from the deck.
 *
 * Rules
 *   - keyboard auto-repeat (event.repeat) is ignored, so a held key or a stuck clicker cannot race
 *     through slides or flicker a toggle;
 *   - keys are ignored while focus is in an input, textarea, select or contenteditable element;
 *   - Ctrl / Alt / Meta combinations are left to the browser (Ctrl+R, Alt+Tab, DevTools ...);
 *   - letters are matched by `key`, falling back to the physical `code`, so they still work while
 *     a Korean (or any non-Latin) input method is active.
 */

export const GOTO_TIMEOUT_MS = 5000;
const GOTO_MAX_DIGITS = 3;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn']);

const act = (type) => ({ action: { type } });

function letterOf(e) {
  const k = e.key;
  if (typeof k === 'string' && k.length === 1) {
    const c = k.toLowerCase();
    if (c >= 'a' && c <= 'z') return c;
  }
  const code = typeof e.code === 'string' ? e.code : '';
  return /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : null;
}

function digitOf(e) {
  if (typeof e.key === 'string' && /^[0-9]$/.test(e.key)) return e.key;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(typeof e.code === 'string' ? e.code : '');
  return m ? m[1] : null;
}

/** True when the event comes from a text-entry element (keys must not drive the deck). */
export function isEditableTarget(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.isContentEditable === true) return true;
  const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Pure key -> command mapping (no goto-prompt state).
 * Returns { action?: {type}, hook?: string, goto?: true } or null for keys the deck does not use.
 */
export function resolveKey(e) {
  const shift = !!e.shiftKey;
  switch (e.key) {
    case 'ArrowRight':
      return act(shift ? 'nextSlide' : 'next');
    case 'ArrowLeft':
      return act(shift ? 'prevSlide' : 'prev');
    case 'ArrowDown':
    case 'PageDown':
    case 'Enter':
      return act('next');
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return act('prev');
    case ' ':
    case 'Spacebar':
      return act(shift ? 'prev' : 'next');
    case 'Home':
      return act('first');
    case 'End':
      return act('last');
    case 'Escape':
    case 'Esc':
      return { hook: 'escape', action: { type: 'unblank' } };
    case 'F5':
      return { hook: 'present', action: { type: 'start' } };
    case 'Tab':
      return act('toggleTimer'); // N27 hyperlink button; also stops Tab from moving focus around the page
    case '?':
      return { hook: 'help' };
    case '.':
      return act('black');
    case ',':
      return act('white');
    default:
      break;
  }
  if (e.code === 'Space') return act(shift ? 'prev' : 'next');
  if (e.code === 'Slash' && shift) return { hook: 'help' };
  switch (letterOf(e)) {
    case 'n':
      return act('nextSlide');
    case 't':
      return act(shift ? 'resetTimer' : 'toggleTimer');
    case 'a':
      return act('toggleAutoBeats');
    case 'p':
      return shift ? { hook: 'openPresenter' } : { hook: 'present', action: { type: 'start' } };
    case 'f':
      return { hook: 'fullscreen' };
    case 'b':
      return act('black');
    case 'w':
      return act('white');
    case 'o':
      return act('toggleOverlay');
    case 'g':
      return { goto: true };
    default:
      return null;
  }
}

/**
 * Bind the deck keys on `target` (window or document). `dispatch(action)` receives store actions;
 * `hooks` handle the DOM-side commands. Returns an unbind function.
 */
export function bindKeys(target, dispatch, hooks = {}, opts = {}) {
  if (!target || typeof target.addEventListener !== 'function') throw new Error('bindKeys: target must be an EventTarget');
  if (typeof dispatch !== 'function') throw new Error('bindKeys: dispatch must be a function');
  const timeoutMs = Number(opts.gotoTimeoutMs) > 0 ? Number(opts.gotoTimeoutMs) : GOTO_TIMEOUT_MS;

  let gotoBuf = null; // null = no prompt; '' or digits while the G prompt is open
  let gotoTimer = null;

  const callHook = (name, e) => {
    const fn = hooks[name];
    if (typeof fn !== 'function') return;
    try {
      fn(e);
    } catch (err) {
      if (typeof console !== 'undefined') console.error(`[deck] ${name} hook failed`, err);
    }
  };
  const prompt = (text) => {
    if (typeof hooks.gotoPrompt !== 'function') return;
    try {
      hooks.gotoPrompt(text);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[deck] gotoPrompt hook failed', err);
    }
  };
  const clearGotoTimer = () => {
    if (gotoTimer !== null) clearTimeout(gotoTimer);
    gotoTimer = null;
  };
  const armGotoTimer = () => {
    clearGotoTimer();
    gotoTimer = setTimeout(() => {
      gotoTimer = null;
      endGoto();
    }, timeoutMs);
  };
  function openGoto() {
    gotoBuf = '';
    prompt('');
    armGotoTimer();
  }
  function endGoto() {
    if (gotoBuf === null) return;
    gotoBuf = null;
    clearGotoTimer();
    prompt(null);
  }

  /** Keys while the G prompt is open. Returns true when the key was consumed by the prompt. */
  function handleGotoKey(e) {
    const prevent = () => e.preventDefault && e.preventDefault();
    if (e.repeat && e.key !== 'Backspace') {
      prevent();
      return true;
    }
    const d = digitOf(e);
    if (d !== null) {
      prevent();
      if (gotoBuf.length < GOTO_MAX_DIGITS) gotoBuf += d;
      prompt(gotoBuf);
      armGotoTimer();
      return true;
    }
    if (e.key === 'Backspace') {
      prevent();
      if (!gotoBuf) endGoto();
      else {
        gotoBuf = gotoBuf.slice(0, -1);
        prompt(gotoBuf);
        armGotoTimer();
      }
      return true;
    }
    if (e.key === 'Enter') {
      prevent();
      const typed = gotoBuf;
      endGoto();
      if (typed) dispatch({ type: 'gotoNumber', n: parseInt(typed, 10) });
      return true;
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
      prevent();
      endGoto();
      return true;
    }
    if (letterOf(e) === 'g') {
      prevent();
      openGoto(); // start over
      return true;
    }
    endGoto(); // any other key closes the prompt and then does its normal job
    return false;
  }

  function onKeyDown(e) {
    if (!e || e.defaultPrevented) return;
    if (MODIFIER_KEYS.has(e.key)) return;
    if (isEditableTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (gotoBuf !== null && handleGotoKey(e)) return;

    const cmd = resolveKey(e);
    if (!cmd) return;
    if (e.preventDefault) e.preventDefault(); // no page scroll, no reload on F5, no button activation
    if (e.repeat) return; // a held key must not race through slides
    if (cmd.goto) {
      openGoto();
      return;
    }
    if (cmd.hook) callHook(cmd.hook, e); // hooks run first: fullscreen needs the user gesture
    if (cmd.action) dispatch(cmd.action);
  }

  target.addEventListener('keydown', onKeyDown);
  return function unbind() {
    target.removeEventListener('keydown', onKeyDown);
    endGoto();
  };
}

export const WHEEL_MIN_DELTA = 40; // px; one mouse-wheel notch is ~100 in Chrome/Edge on Windows
export const WHEEL_QUIET_MS = 300;

/**
 * Mouse-wheel navigation for the N27's scroll-wheel mode: one button press sends one wheel notch,
 * which becomes one next/prev step. A laptop trackpad's long or inertial scroll triggers at most one
 * step, because after a step the wheel is ignored until it has been quiet for `quietMs`.
 *
 *   bindWheel(window, store.dispatch, { ignore: (e) => !!e.target.closest('[data-scrollable]') })
 *
 * `ignore(e)` returning true lets the page scroll normally (e.g. the presenter's notes panel).
 * Ctrl/Meta + wheel is browser zoom and is left alone. Returns an unbind function.
 */
export function bindWheel(target, dispatch, opts = {}) {
  if (!target || typeof target.addEventListener !== 'function') throw new Error('bindWheel: target must be an EventTarget');
  if (typeof dispatch !== 'function') throw new Error('bindWheel: dispatch must be a function');
  const quietMs = Number(opts.quietMs) >= 0 ? Number(opts.quietMs) : WHEEL_QUIET_MS;
  const minDelta = Number(opts.minDelta) > 0 ? Number(opts.minDelta) : WHEEL_MIN_DELTA;
  const ignore = typeof opts.ignore === 'function' ? opts.ignore : () => false;
  const now = typeof opts.now === 'function' ? opts.now : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let last = -Infinity;
  let armed = true;

  function onWheel(e) {
    if (!e || e.ctrlKey || e.metaKey) return;
    if (isEditableTarget(e.target)) return;
    try {
      if (ignore(e)) return;
    } catch {
      /* a failing ignore() must not break navigation */
    }
    const t = now();
    if (t - last >= quietMs) armed = true;
    last = t;
    if (e.preventDefault) e.preventDefault();
    if (!armed) return;
    let dy = Number(e.deltaY) || 0;
    if (e.deltaMode === 1) dy *= 40; // lines
    else if (e.deltaMode === 2) dy *= 800; // pages
    if (Math.abs(dy) < minDelta) return;
    armed = false;
    dispatch({ type: dy > 0 ? 'next' : 'prev' });
  }

  target.addEventListener('wheel', onWheel, { passive: false });
  return function unbind() {
    target.removeEventListener('wheel', onWheel, { passive: false });
  };
}
