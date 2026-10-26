// screens.js - second-screen (projector) detection and the "present" flow. Pure HTML: no server, no flags.
//
// The user's words: "automatically detect when the computer is connected to a projector or second screen and
// should have the option to present to that second screen while keeping a preview and notes on the first screen."
//
//   detection : screen.isExtended + screen 'change' events (no permission, works on file:// and https); once the
//               window-management permission is granted, getScreenDetails() + 'screenschange' for the exact list.
//   present   : inside ONE key / click handler: getScreenDetails() -> requestFullscreen({ screen: external }) for
//               the audience window -> window.open(<this file>?view=presenter) sized to the laptop screen
//               (Chrome's "fullscreen companion window").
//   fallback  : API missing (Firefox, Safari) or refused (often on file://): open the presenter window normally and
//               show a hint on the audience window: "Drag this window to the projector, then press F."
//   one screen: Windows mirroring (Duplicate) means no second screen: P goes fullscreen here, and the hint
//               says Win+P, then Extend.
//   unplugged : projector removed mid-talk: leave fullscreen cleanly; the deck state is untouched.
//   tests     : ?simulateScreens=2 fakes a second screen; window.__seoulScreens.set(n) plugs / unplugs it;
//               add &simulateWM=0 to take the fallback path (no Window Management API).
//
// No UI text in this file uses em or en dashes.

export const PRESENTER_WINDOW = 'seoul-presenter';
export const AUDIENCE_WINDOW = 'seoul-slides';

// ---------------------------------------------------------------- URLs
function urlParams() {
  try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); }
}

/** The presenter view of this same file or link: <href>?view=presenter (keeps simulateScreens for tests). */
export function presenterUrlFor(href) {
  try {
    const u = new URL(href || location.href);
    const keep = new URLSearchParams();
    keep.set('view', 'presenter');
    const sim = u.searchParams.get('simulateScreens');
    if (sim) keep.set('simulateScreens', sim);
    u.search = `?${keep.toString()}`;
    u.hash = '';
    return u.href;
  } catch {
    return '?view=presenter';
  }
}

/** The audience view of this same file or link (no view param), used by the presenter's "Open the slides". */
export function audienceUrlFor(href) {
  try {
    const u = new URL(href || location.href);
    const keep = new URLSearchParams();
    const sim = u.searchParams.get('simulateScreens');
    if (sim) keep.set('simulateScreens', sim);
    const q = keep.toString();
    u.search = q ? `?${q}` : '';
    u.hash = '';
    return u.href;
  } catch {
    return '?';
  }
}

// ---------------------------------------------------------------- simulation (?simulateScreens=2)
const sim = {
  count: (() => { const n = parseInt(urlParams().get('simulateScreens') || '0', 10); return Number.isFinite(n) ? n : 0; })(),
  noApi: urlParams().get('simulateWM') === '0', // ?simulateWM=0: behave like Firefox / a refused permission (fallback path)
  listeners: new Set(),
};
if (typeof window !== 'undefined') {
  window.__seoulScreens = {
    get count() { return sim.count; },
    set(n) { sim.count = Math.max(0, n | 0); for (const l of sim.listeners) { try { l(); } catch (e) { console.error(e); } } },
  };
}
export const isSimulated = () => sim.count > 0;

function simulatedScreens() {
  const w = Math.max((typeof screen !== 'undefined' && screen.width) || 1920, 800);
  const h = Math.max((typeof screen !== 'undefined' && screen.height) || 1080, 600);
  const internal = {
    label: 'Built-in display (simulated)', left: 0, top: 0, width: w, height: h,
    availLeft: 0, availTop: 0, availWidth: w, availHeight: h - 48, isPrimary: true, isInternal: true, simulated: true,
  };
  const list = [internal];
  for (let i = 1; i < sim.count; i++) {
    list.push({
      label: `Projector ${i} (simulated)`, left: w * i, top: 0, width: 1920, height: 1080,
      availLeft: w * i, availTop: 0, availWidth: 1920, availHeight: 1080, isPrimary: false, isInternal: false, simulated: true,
    });
  }
  return list;
}

// ---------------------------------------------------------------- capability checks
export function hasWindowManagement() {
  return typeof window !== 'undefined' && typeof window.getScreenDetails === 'function';
}
const isFile = () => { try { return location.protocol === 'file:'; } catch { return false; } };
const hasIsExtended = () => typeof screen !== 'undefined' && 'isExtended' in screen;

/** True when the OS reports more than one screen (Extend mode). Duplicate / mirror mode reports one. */
export function isExtendedNow() {
  if (isSimulated()) return sim.count > 1;
  if (sharedDetails) { try { return Array.from(sharedDetails.screens || []).length > 1; } catch { /* fall through */ } }
  return hasIsExtended() ? !!screen.isExtended : false;
}

/** 'granted' | 'prompt' | 'denied' | 'unsupported' */
export async function windowManagementPermission() {
  if (!hasWindowManagement()) return 'unsupported';
  if (!navigator.permissions || !navigator.permissions.query) return 'prompt';
  for (const name of ['window-management', 'window-placement']) {
    try { const st = await navigator.permissions.query({ name }); return st.state; } catch { /* try the legacy name */ }
  }
  return 'prompt';
}

function pickScreens(list, current) {
  if (!list || list.length < 2) return null;
  // the laptop panel: built-in display, else the primary one, else the screen the window is on
  const internal = list.find((s) => s.isInternal) || list.find((s) => s.isPrimary) || current || list[0];
  const others = list.filter((s) => s !== internal);
  const external = others.find((s) => !s.isPrimary) || others.find((s) => s !== current) || others[0];
  return external ? { internal, external } : null;
}

function describe(s) {
  if (!s) return null;
  return {
    label: s.label || '', left: s.left, top: s.top, width: s.width, height: s.height,
    availLeft: s.availLeft, availTop: s.availTop, availWidth: s.availWidth, availHeight: s.availHeight,
    isPrimary: !!s.isPrimary, isInternal: !!s.isInternal,
  };
}

const sameScreen = (a, b) => !!a && !!b && a.l === b.l && a.t === b.t && a.w === b.w && a.h === b.h;

// ---------------------------------------------------------------- watchScreens
let sharedDetails = null; // ScreenDetails once permission is granted (shared by watch + present)

/**
 * watchScreens(cb) -> stop()
 * cb({ extended, count, supported, simulated, permission, screens }) is called soon after the call and again
 * whenever the number of screens changes. `screens` is a plain description list when known (needs permission
 * or simulation), else null.
 */
export function watchScreens(cb) {
  let stopped = false;
  let lastKey = '';
  let permission = 'unknown';
  let details = null;
  const cleanups = [];

  const emit = () => {
    if (stopped) return;
    let info;
    if (isSimulated()) {
      const list = simulatedScreens();
      info = { extended: list.length > 1, count: list.length, supported: true, simulated: true, permission: 'granted', screens: list.map(describe) };
    } else {
      const supported = hasWindowManagement() || hasIsExtended();
      const list = details ? Array.from(details.screens || []) : null;
      const extended = list ? list.length > 1 : (hasIsExtended() ? !!screen.isExtended : false);
      info = { extended, count: list ? list.length : (extended ? 2 : 1), supported, simulated: false, permission, screens: list ? list.map(describe) : null };
    }
    const key = `${info.extended}|${info.count}|${info.permission}|${info.simulated}`;
    if (key === lastKey) return;
    lastKey = key;
    try { cb(info); } catch (e) { console.error(e); }
  };

  const attachDetails = (d) => {
    if (!d || details === d) return;
    details = d;
    sharedDetails = d;
    const on = () => emit();
    d.addEventListener('screenschange', on);
    d.addEventListener('currentscreenchange', on);
    cleanups.push(() => { d.removeEventListener('screenschange', on); d.removeEventListener('currentscreenchange', on); });
    emit();
  };

  const onScreenChange = () => emit();
  if (typeof screen !== 'undefined' && typeof screen.addEventListener === 'function') {
    screen.addEventListener('change', onScreenChange);
    cleanups.push(() => screen.removeEventListener('change', onScreenChange));
  }
  const onSim = () => emit();
  sim.listeners.add(onSim);
  cleanups.push(() => sim.listeners.delete(onSim));

  // safety net: some drivers / browser versions miss the change event
  const poll = setInterval(() => { if (sharedDetails && sharedDetails !== details) attachDetails(sharedDetails); emit(); }, 2000);
  cleanups.push(() => clearInterval(poll));

  (async () => {
    permission = await windowManagementPermission();
    // Only call getScreenDetails() without a gesture when it cannot show a prompt.
    if (permission === 'granted' && !isSimulated()) {
      try { attachDetails(await window.getScreenDetails()); } catch { /* ignore */ }
    }
    try {
      if (navigator.permissions && permission !== 'unsupported') {
        const st = await navigator.permissions.query({ name: 'window-management' });
        st.addEventListener('change', async () => {
          permission = st.state;
          if (permission === 'granted' && !details) { try { attachDetails(await window.getScreenDetails()); } catch { /* ignore */ } }
          emit();
        });
      }
    } catch { /* ignore */ }
    emit();
  })();
  setTimeout(emit, 0);

  return () => { stopped = true; for (const c of cleanups) { try { c(); } catch { /* ignore */ } } };
}

// ---------------------------------------------------------------- presenter window
function aliveWin(w) {
  try { return !!w && !w.closed; } catch { return false; }
}

/**
 * openPresenterWindow(url, { screen, name, existing }) -> Window | null
 * Opens (or re-focuses) the presenter popup, sized to `screen` (a ScreenDetailed or plain description;
 * default: the screen this window is on). url defaults to presenterUrlFor(location.href).
 */
export function openPresenterWindow(url, { screen: target = null, name = PRESENTER_WINDOW, existing = null } = {}) {
  const href = url || presenterUrlFor();
  const s = target || {
    availLeft: (typeof screen !== 'undefined' && screen.availLeft) || 0, availTop: (typeof screen !== 'undefined' && screen.availTop) || 0,
    availWidth: (typeof screen !== 'undefined' && screen.availWidth) || 1440, availHeight: (typeof screen !== 'undefined' && screen.availHeight) || 900,
  };
  const left = Math.round(s.availLeft ?? s.left ?? 0);
  const top = Math.round(s.availTop ?? s.top ?? 0);
  const width = Math.round(s.availWidth || s.width || 1440);
  const height = Math.round(s.availHeight || s.height || 900);
  if (aliveWin(existing)) {
    // Moving a cross-origin popup throws on file://; the presenter also moves itself on a 'place' control.
    try { existing.moveTo(left, top); existing.resizeTo(width, height); } catch { /* not allowed: fine */ }
    try { existing.focus(); } catch { /* ignore */ }
    return existing;
  }
  const features = `popup,left=${left},top=${top},width=${width},height=${height}`;
  let w = null;
  try { w = window.open(href, name, features); } catch { w = null; }
  try { if (w) w.focus(); } catch { /* ignore */ }
  return w;
}

/** Rect of a screen for window placement: { left, top, width, height }. */
export function screenRect(s) {
  if (!s) return null;
  return {
    left: Math.round(s.availLeft ?? s.left ?? 0), top: Math.round(s.availTop ?? s.top ?? 0),
    width: Math.round(s.availWidth || s.width || 0), height: Math.round(s.availHeight || s.height || 0),
  };
}

// ---------------------------------------------------------------- present
/**
 * presentOnSecondScreen({ presenterUrl, target, existing, presenterScreen }) -> Promise<result>
 * Call it synchronously from a key / click handler: it needs the user activation.
 *   existing        : the presenter window handle when one is already open (it is focused, not reopened)
 *   presenterScreen : screenSignature() reported by a connected presenter (sync.peerScreens()[0]); lets the
 *                     fallback path tell whether this window has already been dragged to the projector
 * result = { mode, ok, reason, presenterWindow, external, internal, placeRect }
 *   'companion'  slides fullscreen on the projector + presenter window on the laptop
 *   'single'     only one screen (mirroring / Duplicate): slides fullscreen here, no presenter window opened
 *   'fallback'   API missing or refused: presenter window opened normally; drag this window, then press F
 *   'fullscreen' fallback, second press: this window is already on the other screen, so it went fullscreen
 *   'retry'      the permission prompt used up the key press: press P again
 */
export async function presentOnSecondScreen({
  presenterUrl, target = document.documentElement, existing = null, presenterScreen = null, forceFallback = false,
} = {}) {
  const url = presenterUrl || presenterUrlFor();
  const fallback = (reason) => {
    // A presenter is already open and this window is no longer on its screen: the user dragged it. Go fullscreen.
    if (aliveWin(existing) || presenterScreen) {
      const mine = { l: screen.availLeft | 0, t: screen.availTop | 0, w: screen.width | 0, h: screen.height | 0 };
      if (!presenterScreen || !sameScreen(mine, presenterScreen)) return goFullscreen(target, 'fullscreen', reason);
      return { mode: 'fallback', ok: true, reason, presenterWindow: aliveWin(existing) ? existing : null, again: true };
    }
    const w = openPresenterWindow(url, { existing });
    return { mode: 'fallback', ok: !!w, reason: w ? reason : 'popup-blocked', presenterWindow: w };
  };

  if (isSimulated()) {
    const list = simulatedScreens();
    const pick = pickScreens(list, list[0]);
    if (!pick) return goFullscreen(target, 'single', 'one-screen');
    if (sim.noApi) return fallback('simulated-no-api');
    // No real second screen, so Chrome's companion-window exception does not apply and requestFullscreen()
    // would consume the key press: open the presenter first, then try fullscreen (allowed to fail in tests).
    const w = openPresenterWindow(url, { screen: pick.internal, existing });
    try { await target.requestFullscreen(); } catch { /* activation used by the popup / headless: fine here */ }
    return {
      mode: 'companion', ok: true, simulated: true, presenterWindow: w,
      external: describe(pick.external), internal: describe(pick.internal), placeRect: screenRect(pick.internal),
    };
  }

  if (forceFallback) return fallback('forced');
  const extended = hasIsExtended() ? !!screen.isExtended : null;
  if (extended === false && !sharedDetails) return goFullscreen(target, 'single', 'one-screen');
  if (!hasWindowManagement()) return fallback('unsupported');

  const before = await windowManagementPermission();
  if (before === 'denied') return fallback('denied');

  let details = sharedDetails;
  const t0 = performance.now();
  if (!details) {
    try { details = await window.getScreenDetails(); sharedDetails = details; }
    catch { return fallback(isFile() ? 'file' : 'denied'); }
  }
  const prompted = before !== 'granted';
  const list = Array.from(details.screens || []);
  const pick = pickScreens(list, details.currentScreen);
  if (!pick) return goFullscreen(target, 'single', 'one-screen');

  // requestFullscreen() consumes the key press's activation; the popup right after it is allowed by Chrome's
  // "fullscreen companion window" rule (permission granted + fullscreen on another screen). If it is still
  // blocked, the controller says so and Shift+P opens the presenter on the laptop screen.
  try {
    await target.requestFullscreen({ screen: pick.external, navigationUI: 'hide' });
  } catch {
    // A first-time permission prompt usually outlives the key press's activation.
    if (prompted || performance.now() - t0 > 4000) return { mode: 'retry', ok: false, reason: 'activation-expired' };
    return fallback('fullscreen-refused');
  }
  const w = openPresenterWindow(url, { screen: pick.internal, existing });
  return {
    mode: 'companion', ok: true, presenterWindow: w, external: describe(pick.external), internal: describe(pick.internal),
    placeRect: screenRect(pick.internal), reason: w ? '' : 'popup-blocked', _externalScreen: pick.external,
  };
}

async function goFullscreen(target, mode, reason = '') {
  try {
    if (!document.fullscreenElement) await target.requestFullscreen({ navigationUI: 'hide' });
    return { mode, ok: true, reason };
  } catch {
    return { mode, ok: false, reason: 'fullscreen-refused' };
  }
}

// ---------------------------------------------------------------- toast + hint (outside the stage)
let uiStyled = false;
function ensureStyle() {
  if (uiStyled || typeof document === 'undefined') return;
  uiStyled = true;
  const st = document.createElement('style');
  st.textContent = `
.sd-toasts{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.sd-toast{font:600 17px/1.35 Montserrat,system-ui,sans-serif;letter-spacing:0;color:#FFFFFF;background:#111112;border:1px solid #2E2F31;border-radius:10px;padding:13px 20px;max-width:min(720px,90vw);text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.28);opacity:0;transform:translateY(10px);transition:opacity .35s ease-out,transform .35s ease-out}
.sd-toast.is-in{opacity:1;transform:none}
.sd-toast.is-out{opacity:0;transform:translateY(6px);transition:opacity .3s ease-in,transform .3s ease-in}
.sd-toast[data-level=warn]{border-color:#CD2E3A}
.sd-toast kbd,.sd-hint kbd{font:700 15px/1 Montserrat,system-ui,sans-serif;display:inline-block;min-width:1.6em;padding:4px 7px;margin:0 2px;border:1px solid #6B6D70;border-radius:5px;background:#1E1E20;color:#FFFFFF}
.sd-hint{position:fixed;left:50%;top:6vh;transform:translateX(-50%);z-index:2147483001;max-width:min(900px,92vw);box-sizing:border-box;padding:22px 30px 20px;border-radius:14px;background:#111112;color:#FFFFFF;border:2px solid #0047A0;box-shadow:0 16px 48px rgba(0,0,0,.35);font:700 clamp(18px,2.2vw,30px)/1.3 Montserrat,system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .35s ease-out}
.sd-hint.is-in{opacity:1}
.sd-hint small{display:block;margin-top:10px;font-weight:500;font-size:.62em;color:#C9CACC}
.sd-hint kbd{font-size:.8em}
@media (prefers-reduced-motion:reduce){.sd-toast,.sd-toast.is-out,.sd-hint{transition:none}}
@media print{.sd-toasts,.sd-hint{display:none!important}}`;
  document.head.appendChild(st);
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const withKbd = (text) => escHtml(text).replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>').replace(/&lt;small&gt;(.*?)&lt;\/small&gt;/g, '<small>$1</small>');

/** showToast(text, { ms, level }): text may contain <kbd>X</kbd>; everything else is escaped. */
export function showToast(text, { ms = 6000, level = 'info' } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  ensureStyle();
  let host = document.querySelector('.sd-toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'sd-toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  for (const old of [...host.children]) if (old.dataset.text === text) old.remove(); // no duplicates
  const el = document.createElement('div');
  el.className = 'sd-toast';
  el.dataset.level = level;
  el.dataset.text = text;
  el.innerHTML = withKbd(text);
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('is-in'));
  const kill = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 350); };
  const timer = setTimeout(kill, ms);
  return { el, close() { clearTimeout(timer); kill(); } };
}

let hintEl = null;
let hintTimer = 0;
/**
 * showHint(text, { ms }) -> { close() }: one large, persistent hint on this window (outside the stage), e.g.
 * "Drag this window to the projector, then press <kbd>F</kbd>." Replaces the previous hint. Hidden in print.
 */
export function showHint(text, { ms = 0 } = {}) {
  if (typeof document === 'undefined' || !document.body) return { close() {} };
  ensureStyle();
  hideHint();
  hintEl = document.createElement('div');
  hintEl.className = 'sd-hint';
  hintEl.setAttribute('role', 'status');
  hintEl.dataset.text = text;
  hintEl.innerHTML = withKbd(text);
  document.body.appendChild(hintEl);
  const el = hintEl;
  requestAnimationFrame(() => el.classList.add('is-in'));
  if (ms > 0) hintTimer = setTimeout(() => { if (hintEl === el) hideHint(); }, ms);
  return { el, close() { if (hintEl === el) hideHint(); } };
}
export function hideHint() {
  clearTimeout(hintTimer);
  if (hintEl) { hintEl.remove(); hintEl = null; }
}
const hintText = () => (hintEl ? hintEl.textContent : '');

// ---------------------------------------------------------------- controller (audience side)
export const MESSAGES = {
  detected: 'Projector detected. Press <kbd>P</kbd> to present on it.',
  drag: 'Drag this window to the projector, then press <kbd>F</kbd>.',
  dragPresenter: 'The slides window is behind this one. Drag it to the projector, click it, then press F.',
  oneScreen: 'Presenting on one screen. For notes on the laptop: press <kbd>Win</kbd>+<kbd>P</kbd>, choose Extend, then press <kbd>P</kbd> again.',
  retry: 'Screen access allowed. Press <kbd>P</kbd> again to present.',
  popup: 'Pop-up blocked. Allow pop-ups for this page, then press <kbd>Shift</kbd>+<kbd>P</kbd>.',
  companionNoPopup: 'Slides are on the projector. Allow pop-ups for this page, then press <kbd>Shift</kbd>+<kbd>P</kbd> for the presenter view.',
  disconnected: 'Projector disconnected. Your place is kept. Press <kbd>P</kbd> to present again.',
  fullscreenRefused: 'Fullscreen was refused. Click the slides, then press <kbd>F</kbd>.',
};

/**
 * createScreenController({ presenterUrl, sync, toast, onPresent, onChange })
 * Ready-made audience-window glue: watches screens, shows the toasts and hints, runs the present flow, keeps
 * the presenter popup handle attached to sync, and leaves fullscreen cleanly if the projector is unplugged
 * mid-talk (the deck state is untouched).
 * Returns { present(), openPresenter(), toggleFullscreen(), info(), presenting(), mode(), presenterWindow(),
 *           uiState(), stop() }.
 *   present()          call from the P key handler, synchronously (it needs the user activation)
 *   openPresenter()    Shift+P: open or focus the presenter window on this screen
 *   toggleFullscreen() F
 *   uiState()          { presenting, mode, fullscreen, screens, hint }: merge into the ui object you broadcast
 *   onPresent({ mode }) fires when the slides actually go fullscreen for the audience
 *   onChange(uiState)   any change worth re-broadcasting
 */
export function createScreenController({ presenterUrl = '', sync = null, toast = null, onPresent = null, onChange = null } = {}) {
  const url = presenterUrl || presenterUrlFor();
  let presenterWin = null;
  let presenting = false;
  let mode = '';
  let externalScreen = null;
  let screens = { extended: false, count: 1, simulated: false };
  let busy = false;
  let seenFirst = false;
  let laptopRect = null; // where the presenter belongs once we know the screens (companion mode)
  let detectedToast = null;
  const closeDetected = () => {
    if (detectedToast && typeof detectedToast.close === 'function') { try { detectedToast.close(); } catch { /* ignore */ } }
    detectedToast = null;
  };

  const local = (text, opts = {}) => (toast || showToast)(text, opts);
  const remote = (text, opts = {}) => { if (sync && sync.isConnected && sync.isConnected()) sync.notify(text, opts); };
  const both = (text, opts = {}) => { local(text, opts); remote(text, opts); };
  const fullscreen = () => !!document.fullscreenElement;
  const uiState = () => ({
    presenting, mode, fullscreen: fullscreen(),
    screens: { extended: !!screens.extended, count: screens.count | 0, simulated: !!screens.simulated },
    hint: hintText(),
  });
  const changed = () => { try { if (onChange) onChange(uiState()); } catch (e) { console.error(e); } };

  function knownPresenter() {
    if (aliveWin(presenterWin)) return presenterWin;
    try {
      const ws = sync && sync.peerWindows ? sync.peerWindows() : [];
      if (ws.length) { presenterWin = ws[0]; return presenterWin; }
    } catch { /* ignore */ }
    return null;
  }

  function exitFullscreen() {
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ignore */ }
  }

  function dropPresentation() {
    exitFullscreen();
    presenting = false; mode = ''; externalScreen = null;
  }

  const stopWatch = watchScreens((info) => {
    const was = !!screens.extended;
    screens = info;
    if (info.extended && (!was || !seenFirst) && !presenting) {
      detectedToast = local(MESSAGES.detected, { ms: 9000 });
      remote(MESSAGES.detected, { ms: 9000 });
    }
    if (!info.extended && was && (presenting || fullscreen())) {
      // projector unplugged mid-talk: leave fullscreen so the slides do not cover the laptop; state is kept
      dropPresentation();
      hideHint();
      both(MESSAGES.disconnected, { ms: 10000, level: 'warn' });
    } else if (presenting && externalScreen && sharedDetails && !Array.from(sharedDetails.screens || []).includes(externalScreen)) {
      // the exact screen we went fullscreen on disappeared (details known)
      dropPresentation();
      both(MESSAGES.disconnected, { ms: 10000, level: 'warn' });
    }
    seenFirst = true;
    changed();
  });

  const onFs = () => {
    if (fullscreen()) {
      hideHint();
      if (!presenting && !busy) { // during present() the flow itself sets the mode
        // F after the drag hint, or fullscreen from the browser menu: the audience now sees the slides
        presenting = true;
        if (!mode || mode === 'fallback') mode = 'fullscreen';
        try { if (onPresent) onPresent({ mode }); } catch (e) { console.error(e); }
      }
    } else if (presenting) {
      presenting = false; mode = ''; externalScreen = null;
    }
    changed();
  };
  document.addEventListener('fullscreenchange', onFs);

  const keep = (w) => { if (w) { presenterWin = w; try { if (sync) sync.attach(w); } catch { /* ignore */ } } };
  const place = (rect) => { if (rect && sync && sync.control) { try { sync.control({ type: 'place', rect }); } catch { /* ignore */ } } };

  async function present() {
    if (busy) return null;
    busy = true;
    closeDetected();
    try {
      const existing = knownPresenter();
      const peerScr = sync && sync.peerScreens ? sync.peerScreens()[0] || null : null;
      const res = await presentOnSecondScreen({ presenterUrl: url, existing, presenterScreen: existing ? peerScr : null });
      keep(res.presenterWindow);
      if (res.mode === 'companion') {
        presenting = true; mode = 'companion'; externalScreen = res._externalScreen || null;
        laptopRect = res.placeRect || laptopRect;
        hideHint();
        place(res.placeRect);
        if (!res.presenterWindow) local(MESSAGES.companionNoPopup, { ms: 12000, level: 'warn' });
      } else if (res.mode === 'single') {
        presenting = res.ok; mode = res.ok ? 'single' : '';
        hideHint();
        local(res.ok ? MESSAGES.oneScreen : MESSAGES.fullscreenRefused, { ms: 9000 });
      } else if (res.mode === 'fullscreen') {
        presenting = res.ok; mode = res.ok ? 'fullscreen' : 'fallback';
        if (res.ok) hideHint(); else local(MESSAGES.fullscreenRefused, { ms: 8000 });
      } else if (res.mode === 'retry') {
        local(MESSAGES.retry, { ms: 9000 });
      } else if (res.reason === 'popup-blocked') {
        mode = 'fallback';
        local(MESSAGES.popup, { ms: 12000, level: 'warn' });
      } else {
        // fallback: the presentation really starts when F is pressed in this window on the projector
        presenting = false; mode = 'fallback';
        showHint(MESSAGES.drag);
        remote(MESSAGES.dragPresenter, { ms: 15000 });
      }
      if (presenting) { try { if (onPresent) onPresent({ mode }); } catch (e) { console.error(e); } }
      changed();
      return res;
    } finally { busy = false; }
  }

  function openPresenter() {
    // While the slides fill the projector, Shift+P must put the presenter on the laptop, not on the projector.
    const target = presenting && mode === 'companion' && laptopRect
      ? { availLeft: laptopRect.left, availTop: laptopRect.top, availWidth: laptopRect.width, availHeight: laptopRect.height }
      : null;
    const w = openPresenterWindow(url, { existing: knownPresenter(), screen: target });
    keep(w);
    if (!w) local(MESSAGES.popup, { ms: 10000, level: 'warn' });
    changed();
    return w;
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      local(MESSAGES.fullscreenRefused, { ms: 7000 });
    }
  }

  return {
    present,
    openPresenter,
    toggleFullscreen,
    info: () => ({ ...screens }),
    presenting: () => presenting,
    mode: () => mode,
    presenterWindow: () => knownPresenter(),
    uiState,
    stop() { stopWatch(); document.removeEventListener('fullscreenchange', onFs); hideHint(); },
  };
}
