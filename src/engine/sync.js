// sync.js - audience (leader) <-> presenter (follower) messaging. Pure HTML: no server, no extension.
//
// The audience window owns the store (state.js) and is the LEADER. The presenter window is the same file
// opened by the audience with window.open(<same file or link>?view=presenter); it is a FOLLOWER: it sends
// commands and renders the snapshots the leader broadcasts. It never owns state.
//
// Transports (both used; duplicates are dropped by sender id + sequence number):
//   1. window.postMessage(msg, '*') to window.opener, window.parent (tests), the popup handle and every
//      event.source seen. Works on file:// (each file:// page is an opaque origin, hence targetOrigin '*').
//      Payloads carry no secrets: slide index, timers, notes keys.
//   2. BroadcastChannel('seoul-deck') when available: reaches same-origin windows on the https site even
//      when neither window holds a handle to the other. On file:// it is simply ignored by the browser.
//
// Resilience:
//   - Followers send 'hello' until a leader answers, then 'ping' every heartbeatMs. A reloaded audience
//     window learns the presenter's WindowProxy from event.source of the next ping and attaches it.
//   - When the leader changes (audience reloaded or reopened) the follower immediately sends a fresh
//     'hello' carrying the last snapshot it rendered (body.lastState / body.lastUi), so the new leader can
//     continue the talk: see shouldRestore().
//   - The leader re-sends its last snapshot every heartbeatMs even if nothing changed, so a reopened
//     presenter catches up within a second; it also answers every 'hello' at once.
//   - Followers send 'bye' on pagehide, so the leader can show the single-screen overlay timer at once.
//     A presenter popup whose handle we hold counts as connected while it is open, even if a background
//     window's timers are throttled.
//
// Commands sent by presenter.js (cmd.type):
//   'action'  { action: { type, ...payload } }   a store action from state.js (next, prev, nextSlide, prevSlide,
//                                                toggleTimer, resetTimer, toggleAutoBeats, black, white,
//                                                toggleOverlay, first, last, goto, gotoNumber, start ...)
//   'present' / 'fullscreen' / 'openPresenter' / 'help'   audience-window hooks (P, F, Shift+P, ?)
//   'key'     { key, code, shiftKey, ... }        a raw key pressed in the presenter (rarely needed)
// Every command except 'key' also carries `key`: the equivalent shortcut from ARCHITECTURE section 3, so
// createCommandRouter() can replay it into the audience window's own bindKeys() when no handler exists.
//
// What the leader should broadcast (sync.broadcast(state, ui)):
//   state = store.getState() snapshot (state.js)
//   ui    = { presenting, mode, fullscreen, screens: { extended, count, simulated }, hint,   <- screens.js controller.uiState()
//             overlay (on-slide timer visible on the audience screen), keySeq, lastKey }     <- audience.js
// Leader -> follower extras: notify(text, opts) shows a toast in the presenter; control({ type: 'place', rect })
// asks the presenter window to move itself (window.moveTo works on a popup from inside it, also on file://).

export const CHANNEL = 'seoul-deck';
const NS = 'seoul-deck/v2';

const KEYS = {
  next: { key: 'ArrowRight', code: 'ArrowRight' },
  prev: { key: 'ArrowLeft', code: 'ArrowLeft' },
  nextSlide: { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true },
  prevSlide: { key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true },
  toggleTimer: { key: 't', code: 'KeyT' },
  resetTimer: { key: 'T', code: 'KeyT', shiftKey: true },
  toggleAutoBeats: { key: 'a', code: 'KeyA' },
  black: { key: 'b', code: 'KeyB' },
  white: { key: 'w', code: 'KeyW' },
  toggleOverlay: { key: 'o', code: 'KeyO' },
  first: { key: 'Home', code: 'Home' },
  last: { key: 'End', code: 'End' },
  // hooks
  present: { key: 'p', code: 'KeyP' },
  fullscreen: { key: 'f', code: 'KeyF' },
  openPresenter: { key: 'P', code: 'KeyP', shiftKey: true },
  help: { key: '?', code: 'Slash', shiftKey: true },
};

/** A store-action command, e.g. actionCommand('toggleTimer') or actionCommand('goto', { index: 4 }). */
export function actionCommand(type, payload = {}) {
  const key = KEYS[type];
  const cmd = { type: 'action', action: { type, ...payload } };
  if (key) cmd.key = { ...key };
  return cmd;
}

/** A hook command: hookCommand('present' | 'fullscreen' | 'openPresenter' | 'help'). */
export function hookCommand(type, extra = {}) {
  const key = KEYS[type];
  return key ? { type, key: { ...key }, ...extra } : { type, ...extra };
}

const nowMs = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 9) + nowMs().toString(36).slice(-5);
const LONG_ALIVE_MS = 60000; // an open popup counts as connected this long without messages

function plain(v) {
  // structured-clone safety net: strip functions / DOM nodes if a caller passes something exotic
  try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
}

function isClosed(w) {
  try { return !w || w.closed === true; } catch { return false; }
}

/** The screen this window is on, as a short signature (used to tell the laptop from the projector). */
export function screenSignature(scr = typeof screen !== 'undefined' ? screen : null) {
  if (!scr) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
  return { l: n(scr.availLeft ?? scr.left), t: n(scr.availTop ?? scr.top), w: n(scr.width), h: n(scr.height) };
}

/**
 * createSync({ role, onCommand, onState, ... })
 *   role: 'audience' | 'leader'  -> leader
 *         'presenter' | 'follower' -> follower
 * Leader options:   onCommand(cmd, meta), onPeers(count), onHello(body, meta), onActivity(),
 *                   getSnapshot() -> { state, ui } (answers 'hello' at once and feeds the heartbeat)
 * Follower options: onState(state, meta) with meta = { ui, sentAt, receivedAt, via, leader },
 *                   onNotice({ text, level, ms }), onLeader(alive), onControl(body)
 * Returns { id, role, isLeader, attach(win), detach(win), broadcast(state, ui), send(cmd, opts),
 *           notify(text, opts), control(body), peerCount(), peerWindows(), peerScreens(), isConnected(),
 *           lastSnapshot(), close() }
 */
export function createSync(opts = {}) {
  const {
    role = 'audience',
    onCommand, onState, onNotice, onPeers, onLeader, onHello, onActivity, onControl, getSnapshot,
    heartbeatMs = 1000,
    peerTimeoutMs = 3500,
    win = typeof window !== 'undefined' ? window : null,
  } = opts;

  const isLeader = role === 'audience' || role === 'leader';
  const myRole = isLeader ? 'audience' : 'presenter';
  const sid = rid();
  let seq = 0;
  let closed = false;

  const targets = new Set(); // WindowProxy handles we postMessage to
  const seen = new Map(); // sender sid -> highest seq processed
  const peers = new Map(); // (leader) presenter sid -> { lastSeen, source, scr }
  let lastPeerCount = 0;

  // follower bookkeeping
  let leaderSid = null;
  let leaderLastSeen = 0;
  let leaderAlive = false;
  let snapshot = null; // last { state, ui, sentAt }

  // leader bookkeeping
  let lastBroadcastAt = 0;
  let lastSent = null; // last { state, ui }

  // ---------- transport ----------
  let bc = null;
  try {
    if (typeof BroadcastChannel === 'function') {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => receive(e.data, null, 'bc');
    }
  } catch { bc = null; }

  const onWindowMessage = (e) => receive(e.data, e.source, 'pm');
  if (win) win.addEventListener('message', onWindowMessage);

  function related() {
    // windows we are related to without having been told: our opener, and (follower only) a framing parent
    const out = [];
    if (!win) return out;
    let op = null;
    try { op = win.opener && !isClosed(win.opener) ? win.opener : null; } catch { op = null; }
    if (op) out.push(op);
    if (!isLeader) {
      let par = null;
      try { par = win.parent && win.parent !== win ? win.parent : null; } catch { par = null; }
      if (par) out.push(par);
    }
    return out;
  }

  function liveTargets() {
    const out = [];
    for (const w of targets) {
      if (isClosed(w)) targets.delete(w);
      else out.push(w);
    }
    for (const w of related()) if (!out.includes(w)) out.push(w);
    return out;
  }

  function post(kind, body, { delegate, only } = {}) {
    if (closed) return false;
    const m = { ns: NS, kind, role: myRole, sid, seq: ++seq, t: nowMs(), body };
    let delivered = false;
    const wins = only ? [only] : liveTargets();
    for (const w of wins) {
      if (delegate) {
        // Capability Delegation: lets the audience window call requestFullscreen() on behalf of a key press
        // in the presenter window (Chromium). Throws if unsupported or without user activation.
        try { w.postMessage(m, { targetOrigin: '*', delegate }); delivered = true; continue; } catch { /* fall through */ }
      }
      try { w.postMessage(m, '*'); delivered = true; }
      catch (err) {
        if (err && err.name === 'DataCloneError') {
          try { w.postMessage(plain(m), '*'); delivered = true; } catch { /* window gone */ }
        }
      }
    }
    // A delegated command must arrive through postMessage (the delegation rides on that event);
    // sending it on the channel too could let the plain copy win the de-duplication race.
    if (bc && !(delegate && delivered) && !only) {
      try { bc.postMessage(m); delivered = true; }
      catch (err) {
        if (err && err.name === 'DataCloneError') { try { bc.postMessage(plain(m)); delivered = true; } catch { /* ignore */ } }
      }
    }
    return delivered;
  }

  function receive(m, source, via) {
    if (closed || !m || typeof m !== 'object' || m.ns !== NS || m.sid === sid) return;
    const last = seen.get(m.sid);
    if (last !== undefined && m.seq <= last) return; // duplicate (other transport) or stale
    seen.set(m.sid, m.seq);
    if (isLeader) leaderReceive(m, source, via);
    else followerReceive(m, source, via);
  }

  const safeCall = (fn, ...args) => {
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (e) { console.error('[sync]', e); return undefined; }
  };

  // ---------- leader ----------
  function emitPeers() {
    const n = peers.size;
    if (n !== lastPeerCount) { lastPeerCount = n; safeCall(onPeers, n); }
  }

  function currentSnapshot() {
    if (getSnapshot) {
      const s = safeCall(getSnapshot);
      if (s && typeof s === 'object' && 'state' in s) return { state: s.state, ui: s.ui || {} };
      if (s) return { state: s, ui: {} };
    }
    return lastSent;
  }

  function leaderReceive(m, source, via) {
    if (m.role !== 'presenter') return; // another audience window: ignore
    if (source && typeof source.postMessage === 'function') targets.add(source);
    if (m.kind === 'bye') {
      peers.delete(m.sid);
      emitPeers();
      return;
    }
    const isNew = !peers.has(m.sid);
    const prevPeer = peers.get(m.sid);
    const scr = (m.body && m.body.scr) || (prevPeer && prevPeer.scr) || null;
    peers.set(m.sid, { lastSeen: nowMs(), source: source || (prevPeer && prevPeer.source) || null, scr });
    if (isNew) emitPeers();
    safeCall(onActivity);

    if (m.kind === 'hello' || isNew) {
      if (m.kind === 'hello') safeCall(onHello, m.body || {}, { from: m.sid, via, sentAt: m.t });
      const snap = currentSnapshot(); // after onHello, so a restore it performed is what we send
      if (snap) post('state', { state: snap.state, ui: snap.ui });
    }
    if (m.kind === 'cmd' && m.body) {
      try { if (onCommand) onCommand(m.body, { from: m.sid, via, sentAt: m.t }); }
      catch (e) { console.error('[sync] command failed', m.body, e); }
    }
  }

  function broadcast(state, ui = {}) {
    lastSent = { state, ui };
    lastBroadcastAt = nowMs();
    return post('state', { state, ui });
  }

  function notify(text, { level = 'info', ms = 6000 } = {}) {
    return isLeader ? post('notice', { text, level, ms }) : false;
  }

  function control(body) {
    return isLeader && body ? post('control', body) : false;
  }

  function prunePeers(t) {
    let changed = false;
    for (const [id, p] of peers) {
      const age = t - p.lastSeen;
      let drop = false;
      if (p.source && isClosed(p.source)) drop = true;
      else if (age > LONG_ALIVE_MS) drop = true;
      else if (age > peerTimeoutMs) {
        // No handle: trust the timeout. With a handle the window is still open; drop this id only when a newer
        // presenter id talks through the same window (the presenter was reloaded without a 'bye').
        if (!p.source) drop = true;
        else for (const [id2, q] of peers) if (id2 !== id && q.source === p.source && q.lastSeen > p.lastSeen) drop = true;
      }
      if (drop) { peers.delete(id); changed = true; }
    }
    if (changed) emitPeers();
  }

  // ---------- follower ----------
  function setLeaderAlive(v) {
    if (v === leaderAlive) return;
    leaderAlive = v;
    safeCall(onLeader, v);
  }

  function helloBody(prev) {
    return {
      scr: screenSignature(),
      lastState: prev ? prev.state : null,
      lastUi: prev ? prev.ui : null,
      // when the leader took that snapshot (same machine clock): the new leader adds the time since then
      lastAt: prev && Number.isFinite(prev.sentAt) ? prev.sentAt : null,
    };
  }

  function followerReceive(m, source, via) {
    if (m.role !== 'audience') return; // other presenters: ignore
    const t = nowMs();
    let fromOpener = false;
    try { fromOpener = !!source && !!win && source === win.opener; } catch { fromOpener = false; }
    // Stick to one leader; switch only if it went silent or the message comes from our own opener.
    if (leaderSid && m.sid !== leaderSid && !fromOpener && t - leaderLastSeen < 2500) return;
    if (source && !fromOpener && typeof source.postMessage === 'function') targets.add(source);
    const changed = !!leaderSid && m.sid !== leaderSid;
    const prev = snapshot;
    leaderSid = m.sid;
    leaderLastSeen = t;
    setLeaderAlive(true);
    // A new leader (audience reloaded or reopened): offer it the talk we were following.
    if (changed && prev && prev.state) post('hello', helloBody(prev));
    if (m.kind === 'state' && m.body) {
      snapshot = { state: m.body.state, ui: m.body.ui || {}, sentAt: m.t };
      try { if (onState) onState(m.body.state, { ui: m.body.ui || {}, sentAt: m.t, receivedAt: t, via, leader: m.sid }); }
      catch (e) { console.error('[sync] onState failed', e); }
    } else if (m.kind === 'notice' && m.body) {
      safeCall(onNotice, m.body);
    } else if (m.kind === 'control' && m.body) {
      safeCall(onControl, m.body);
    }
  }

  function send(cmd, sendOpts = {}) {
    if (isLeader) return false;
    return post('cmd', cmd, sendOpts);
  }

  function hasOpener() {
    try { return !!(win && win.opener); } catch { return false; }
  }
  function openerAlive() {
    try { return hasOpener() && !isClosed(win.opener); } catch { return false; }
  }

  // ---------- timers ----------
  const hb = setInterval(() => {
    const t = nowMs();
    if (isLeader) {
      prunePeers(t);
      if (t - lastBroadcastAt >= heartbeatMs) {
        const snap = currentSnapshot();
        if (snap) { lastBroadcastAt = t; post('state', { state: snap.state, ui: snap.ui }); }
      }
    } else {
      const silent = t - leaderLastSeen;
      // An open opener gets longer (its timers may be throttled while it is covered); a closed one is gone.
      const openerGone = hasOpener() && !openerAlive();
      const limit = openerAlive() ? Math.max(peerTimeoutMs, 12000) : peerTimeoutMs;
      if (leaderAlive && (silent > limit || (openerGone && silent > 1500))) setLeaderAlive(false);
      if (leaderAlive) post('ping', { scr: screenSignature() });
      else post('hello', helloBody(snapshot));
    }
  }, heartbeatMs);

  const onPageHide = () => { if (!isLeader) post('bye', {}); };
  if (win) win.addEventListener('pagehide', onPageHide);

  if (!isLeader) {
    // announce at once, and again shortly after in case the opener was still loading
    post('hello', helloBody(null));
    setTimeout(() => { if (!leaderAlive) post('hello', helloBody(snapshot)); }, 250);
  }

  return {
    id: sid,
    role: myRole,
    isLeader,
    attach(w) {
      if (!w || typeof w.postMessage !== 'function') return;
      targets.add(w);
      if (!isLeader) post('hello', helloBody(snapshot), { only: w });
    },
    detach(w) { targets.delete(w); },
    broadcast,
    send,
    notify,
    control,
    peerCount: () => peers.size,
    /** Open presenter windows we hold a handle to (leader). */
    peerWindows: () => [...peers.values()].map((p) => p.source).filter((w) => w && !isClosed(w)),
    /** Screen signatures reported by the connected presenters (leader). */
    peerScreens: () => [...peers.values()].map((p) => p.scr).filter(Boolean),
    isConnected: () => (isLeader ? peers.size > 0 : leaderAlive),
    lastSnapshot: () => snapshot,
    close() {
      if (closed) return;
      if (!isLeader) post('bye', {});
      closed = true;
      clearInterval(hb);
      if (win) { win.removeEventListener('message', onWindowMessage); win.removeEventListener('pagehide', onPageHide); }
      try { if (bc) bc.close(); } catch { /* ignore */ }
    },
  };
}

/**
 * shouldRestore(local, remote) -> boolean
 * The leader's onHello helper: true when `remote` (body.lastState from a presenter that followed an earlier
 * audience window) is a talk in progress for this same deck while `local` is pristine (nothing presented,
 * timer never started). Use:
 *   onHello(body, meta) { if (shouldRestore(store.getState(), body.lastState))
 *     store.dispatch({ type: 'restore', state: body.lastState, gapMs: Math.max(0, Date.now() - meta.sentAt) }); }
 */
export function shouldRestore(local, remote) {
  if (!remote || typeof remote !== 'object' || !remote.timer) return false;
  if (!local || typeof local !== 'object') return true;
  if (remote.count !== local.count) return false;
  const pristine = !local.started && (local.timer ? local.timer.globalMs : 0) < 1000 && (local.furthest | 0) === 0;
  const progressed = !!remote.started || (remote.furthest | 0) > 0 || (remote.timer.globalMs || 0) > 0;
  return pristine && progressed;
}

/**
 * Replay a key description as synthetic keydown + keyup events. The events bubble from `target`
 * through document to window, so they reach listeners bound with bindKeys(window|document|body, ...).
 */
export function replayKey(target, k) {
  if (!k || !k.key) return;
  const t = target || (typeof document !== 'undefined' ? document.body || document.documentElement : null);
  if (!t) return;
  const init = {
    key: k.key, code: k.code || '', shiftKey: !!k.shiftKey, altKey: !!k.altKey, ctrlKey: !!k.ctrlKey,
    metaKey: !!k.metaKey, repeat: !!k.repeat, bubbles: true, cancelable: true, composed: true,
  };
  t.dispatchEvent(new KeyboardEvent('keydown', init));
  t.dispatchEvent(new KeyboardEvent('keyup', { ...init, repeat: false }));
}

/**
 * createCommandRouter({ dispatch, keyTarget, handlers }) -> (cmd, meta) => boolean
 * Use as createSync({ role: 'audience', onCommand: createCommandRouter({ dispatch: store.dispatch,
 *   keyTarget: document.body, handlers: { present: () => controller.present() } }) }).
 * Order: handlers[cmd.type](cmd, meta) if present (return false to fall through); then
 * cmd.type === 'action' -> dispatch(cmd.action); then the command's keyboard equivalent is replayed into
 * keyTarget, so the audience window's own bindKeys() handles it exactly as if the key were pressed there.
 * Runs synchronously inside the 'message' event, so a delegated user activation (present / fullscreen)
 * is still valid when the handler calls requestFullscreen().
 */
export function createCommandRouter({ dispatch = null, keyTarget = null, handlers = {} } = {}) {
  return function route(cmd, meta) {
    if (!cmd || typeof cmd !== 'object') return false;
    const h = handlers[cmd.type];
    if (typeof h === 'function') {
      const r = h(cmd, meta);
      if (r !== false) return true;
    }
    if (cmd.type === 'action' && cmd.action && typeof dispatch === 'function') { dispatch(cmd.action); return true; }
    if (cmd.type === 'key') { replayKey(keyTarget, cmd); return true; }
    if (cmd.key) { replayKey(keyTarget, cmd.key); return true; }
    return false;
  };
}

// ---------- persistence helpers (audience reload) ----------
const STORE_KEY = 'seoul-deck/state';

/** Save { state, ui } to sessionStorage (survives a reload of the same window). Never throws. */
export function saveSnapshot(state, ui) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ state, ui, savedAt: nowMs() })); } catch { /* storage blocked */ }
}

/** Load the last saved { state, ui, savedAt } or null. Never throws. For restore, gapMs = Date.now() - savedAt. */
export function loadSnapshot(maxAgeMs = 6 * 3600 * 1000) {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !v.state || nowMs() - (v.savedAt || 0) > maxAgeMs) return null;
    return v;
  } catch { return null; }
}

/** Forget the saved snapshot (e.g. after a Shift+T reset). Never throws. */
export function clearSnapshot() {
  try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}
