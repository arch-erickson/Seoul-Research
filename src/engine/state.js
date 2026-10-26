/**
 * Seoul deck - pure presentation state machine (ARCHITECTURE.md section 3).
 *
 * No DOM and no timers of its own: time comes from the injected `now()` and is
 * accounted only when `tick()` or `dispatch()` is called (the audience window
 * ticks ~10x/s). Every snapshot is plain JSON, so it can be postMessaged.
 *
 *   const store = createStore({ slides, now });   // slides = slidesFromTiming(timing)
 *   store.dispatch({ type: 'next' });              // or store.dispatch('next')
 *   store.tick();                                  // accrue time, fire due auto-beats
 *   store.getState();                              // fresh snapshot
 *   const off = store.subscribe((snap) => ...);    // after every dispatch, and every tick while the timer runs
 *
 * createStore options: slides (required), now, autoBeats (default true), overlay (default true),
 * autoGraceMs (default 700, 0 = off), onError (subscriber exceptions; default: rethrown async).
 *
 * Snapshot (plain JSON): v, count, cur, key, kind, n (content number or null), beat (0-based), beats,
 * beatsVisible, fullyBuilt, furthest, furthestBeat, isLive, started,
 * timer {running, pausedByBack, globalMs, slideMs[]}, slideElapsedMs, autoBeats, beatOffsetMs,
 * nextAutoBeatInMs (null when no auto-beat will fire), nextBeatInMs (live-slide cue countdown even
 * while paused), plannedStartMs, plannedDurMs, plannedTotalMs, black, white, overlay,
 * next {kind:'beat'|'slide', index, key, beat, beatsVisible} | null  (what a plain `next` would show),
 * nav {seq, type:'init'|'beat'|'unbuild'|'slide'|'jump'|'restore', dir, auto, instant}
 *   (seq increments on every slide/beat change; instant = render without build animation).
 *
 * Actions ({ type, ...payload }):
 *   next             forward: resume-after-back, else reveal next beat, else next slide
 *   prev             back: un-build on the live slide, else previous slide fully built + pause
 *   nextSlide        skip remaining beats and advance (Shift+Right, N)
 *   prevSlide        previous slide fully built + pause, even mid-build (Shift+Left)
 *   goto {index|key} backward = like prev (pause, fully built); forward = like next (timer runs)
 *   gotoNumber {n}   goto by content-slide number (1-20)
 *   first / last     Home / End
 *   start            presentation mode started: start the timer if it is not running (P)
 *   toggleTimer      T: pause/resume (clears pausedByBack)
 *   resetTimer       Shift+T: zero every timer, stop, and make the current slide the live slide
 *   toggleAutoBeats / setAutoBeats {on}        A
 *   black / white    toggle B / W (mutually exclusive); unblank; setBlank {mode:'black'|'white'|null}
 *   toggleOverlay (alias overlay) / setOverlay {on}   O (on-slide timer overlay)
 *   jump {index|key, beat}    static positioning (URL ?slide=&beat=): no timer side effects
 *   restore {state, gapMs?}   re-apply a previous snapshot (e.g. after an accidental reload)
 *
 * Behaviour notes beyond the letter of section 3 (all deliberate):
 *   - Re-entering the furthest slide forward restores the highest beat reached there
 *     (a half-built slide is not suddenly shown fully built); slides before it are fully built.
 *   - The auto-beat schedule is re-anchored whenever the beat changes by hand or on entry:
 *     beatOffsetMs = slideMs[cur] - cue[beat]*1000. For a manual next this is exactly
 *     offset += (actual - scheduled); on a fresh entry it is 0. Un-building re-anchors too,
 *     so an un-built beat is not instantly re-fired.
 *   - A manual `next` within `autoGraceMs` (700 ms) of an auto-beat is absorbed: the speaker
 *     pressed for the beat that just appeared, so the press cannot skip a beat or leave the slide.
 *   - While black/white is on, next/prev only clear it.
 *   - Going back before the timer has ever started (fresh load, or after Shift+T) pauses
 *     nothing and rewinds: the target slide becomes the live slide at beat 0.
 */

export const DEFAULT_AUTO_GRACE_MS = 700;
export const DEFAULT_IMAGE_SECONDS = 10;
export const IMAGE_CUES = Object.freeze([0, 4]);

const defaultNow = () =>
  typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/** Map spec/timing.json to the store's slide list. Image interstitials are exactly 10 s with beats at 0 s and 4 s. */
export function slidesFromTiming(timing) {
  if (!timing || !Array.isArray(timing.order)) throw new Error('slidesFromTiming: timing.order missing');
  const imageSec = Number(timing.imageSlideSeconds) > 0 ? Number(timing.imageSlideSeconds) : DEFAULT_IMAGE_SECONDS;
  return timing.order.map((s) => {
    const beatCues = Array.isArray(s.beats) && s.beats.length ? s.beats.map((b) => Number(b.cue) || 0) : [0];
    if (s.kind === 'image') {
      return { key: s.key, kind: 'image', n: null, dur: imageSec, cues: beatCues.length === 2 ? beatCues : [...IMAGE_CUES] };
    }
    return {
      key: s.key,
      kind: s.kind || 'content',
      n: Number.isInteger(s.n) ? s.n : null,
      dur: Number(s.dur) || 0,
      cues: beatCues,
    };
  });
}

function normalizeSlides(slides) {
  let ordinal = 0;
  return slides.map((s, i) => {
    if (!s || typeof s !== 'object') throw new Error(`createStore: slide ${i} is not an object`);
    const kind = typeof s.kind === 'string' ? s.kind : 'content';
    if (kind === 'content') ordinal += 1;
    let cues = Array.isArray(s.cues) && s.cues.length ? s.cues.map(Number) : [0];
    cues = cues.map((c) => (Number.isFinite(c) && c > 0 ? c : 0));
    cues[0] = 0; // beat 0 is shown on entry
    for (let k = 1; k < cues.length; k++) if (cues[k] < cues[k - 1]) cues[k] = cues[k - 1];
    const dur = Number(s.dur) > 0 ? Number(s.dur) : 0;
    const n = Number.isInteger(s.n) ? s.n : kind === 'content' ? ordinal : null;
    return { key: String(s.key ?? `slide${i}`), kind, n, dur, cues };
  });
}

function rethrowAsync(err) {
  // A broken subscriber must not corrupt navigation; surface the error asynchronously.
  if (typeof queueMicrotask === 'function') queueMicrotask(() => { throw err; });
  else setTimeout(() => { throw err; }, 0);
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clampInt = (v, lo, hi, d) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function createStore({
  slides,
  now,
  autoBeats = true,
  overlay = true,
  autoGraceMs = DEFAULT_AUTO_GRACE_MS,
  onError = rethrowAsync,
} = {}) {
  if (!Array.isArray(slides) || slides.length === 0) throw new Error('createStore: slides must be a non-empty array');
  const clock = typeof now === 'function' ? now : defaultNow;
  const deck = normalizeSlides(slides);
  const N = deck.length;
  const keyIndex = new Map(deck.map((s, i) => [s.key, i]));
  const plannedStart = [];
  let plannedTotal = 0;
  for (const s of deck) {
    plannedStart.push(plannedTotal);
    plannedTotal += s.dur * 1000;
  }

  const S = {
    cur: 0,
    beat: 0,
    furthest: 0,
    furthestBeat: 0, // highest beat reached on the furthest slide
    started: false, // the timer has run since load / the last reset
    timer: { running: false, pausedByBack: false, globalMs: 0, slideMs: new Array(N).fill(0) },
    autoBeats: !!autoBeats,
    beatOffsetMs: 0,
    black: false,
    white: false,
    overlay: !!overlay,
    nav: { seq: 0, type: 'init', dir: 0, auto: false, instant: true },
  };
  let lastNow = clock();
  let lastAutoAt = -Infinity; // clock time of the most recent auto-beat (grace window)
  const subscribers = new Set();

  // ---------- helpers ----------
  const lastBeat = (i) => deck[i].cues.length - 1;
  const isLive = () => S.cur === S.furthest;
  const dueMs = (k) => deck[S.cur].cues[k] * 1000 + S.beatOffsetMs;
  const canAuto = () => S.autoBeats && S.timer.running && isLive() && S.beat < lastBeat(S.cur);
  const withinGrace = () => autoGraceMs > 0 && lastNow - lastAutoAt < autoGraceMs;

  function accrue() {
    const t = clock();
    const dt = t - lastNow;
    lastNow = t;
    if (S.timer.running && dt > 0) {
      S.timer.globalMs += dt;
      S.timer.slideMs[S.cur] += dt;
    }
  }

  /** Re-anchor the auto-beat schedule so the current beat counts as "now". */
  function anchor() {
    S.beatOffsetMs = S.timer.slideMs[S.cur] - deck[S.cur].cues[S.beat] * 1000;
  }

  function noteFurthestBeat() {
    if (isLive() && S.beat > S.furthestBeat) S.furthestBeat = S.beat;
  }

  function setNav(type, dir, { auto = false, instant } = {}) {
    S.nav = { seq: S.nav.seq + 1, type, dir, auto, instant: instant !== undefined ? instant : dir < 0 };
  }

  function startTimer() {
    S.timer.running = true;
    S.timer.pausedByBack = false;
    S.started = true;
  }

  function clearBlank() {
    S.black = false;
    S.white = false;
  }

  function entryBeat(i) {
    if (i > S.furthest) return 0;
    if (i === S.furthest) return Math.min(S.furthestBeat, lastBeat(i));
    return lastBeat(i);
  }

  function enterForward(i) {
    const b = entryBeat(i);
    if (i > S.furthest) {
      S.furthest = i;
      S.furthestBeat = 0;
    }
    S.cur = i;
    S.beat = b;
    clearBlank();
    if (!S.timer.running) startTimer(); // "going to the next slide, the timer starts"
    anchor(); // fresh entry: offset 0
    lastAutoAt = -Infinity;
    setNav('slide', 1, { instant: b > 0 });
  }

  function enterBackward(i) {
    S.cur = i;
    clearBlank();
    if (!S.started) {
      // Nothing presented since load/reset: rewind instead of pausing.
      S.furthest = i;
      S.furthestBeat = 0;
      S.beat = 0;
    } else {
      S.beat = i === S.furthest ? Math.min(S.furthestBeat, lastBeat(i)) : lastBeat(i);
      S.timer.running = false;
      S.timer.pausedByBack = true;
    }
    anchor();
    lastAutoAt = -Infinity;
    setNav('slide', -1);
  }

  function resolveIndex(a) {
    if (Number.isInteger(a.index)) return a.index >= 0 && a.index < N ? a.index : -1;
    if (typeof a.key === 'string' && keyIndex.has(a.key)) return keyIndex.get(a.key);
    return -1;
  }

  /** Shared preamble for forward presses; returns true if the press was consumed. */
  function forwardPreamble(useGrace) {
    if (S.black || S.white) {
      clearBlank();
      return true;
    }
    if (S.timer.pausedByBack) {
      // User rule: after going back, the first forward press only resumes the timer.
      S.timer.running = true;
      S.timer.pausedByBack = false;
      return true;
    }
    if (useGrace && withinGrace()) {
      lastAutoAt = -Infinity;
      return true;
    }
    if (!S.started) startTimer(); // first forward press starts the talk
    return false;
  }

  // ---------- actions ----------
  function next() {
    if (forwardPreamble(true)) return;
    if (S.beat < lastBeat(S.cur)) {
      S.beat += 1;
      anchor(); // == beatOffsetMs += actual - scheduled
      noteFurthestBeat();
      lastAutoAt = -Infinity;
      setNav('beat', 1);
    } else if (S.cur < N - 1) {
      enterForward(S.cur + 1);
    }
  }

  function nextSlide() {
    if (forwardPreamble(false)) return;
    if (S.cur < N - 1) enterForward(S.cur + 1);
  }

  function prev() {
    if (S.black || S.white) {
      clearBlank();
      return;
    }
    if (isLive() && S.beat > 0) {
      S.beat -= 1; // un-reveal; the timer keeps running
      anchor();
      lastAutoAt = -Infinity;
      setNav('unbuild', -1);
      return;
    }
    if (S.cur > 0) enterBackward(S.cur - 1);
  }

  function prevSlide() {
    if (S.black || S.white) {
      clearBlank();
      return;
    }
    if (S.cur > 0) enterBackward(S.cur - 1);
  }

  function goto(i) {
    if (i < 0 || i >= N || i === S.cur) return;
    if (i < S.cur) enterBackward(i);
    else enterForward(i); // starts / resumes the timer, clears pausedByBack
  }

  function toggleTimer() {
    if (S.timer.running) {
      S.timer.running = false;
      S.timer.pausedByBack = false;
    } else {
      startTimer();
    }
  }

  function resetTimer() {
    S.timer = { running: false, pausedByBack: false, globalMs: 0, slideMs: new Array(N).fill(0) };
    S.started = false;
    S.furthest = S.cur;
    S.furthestBeat = S.beat;
    anchor();
    lastAutoAt = -Infinity;
  }

  function setAutoBeats(on) {
    const was = S.autoBeats;
    S.autoBeats = !!on;
    // Turning auto-beats back on must not instantly fire a beat whose slot passed while it was off.
    if (S.autoBeats && !was && isLive() && S.beat < lastBeat(S.cur) && S.timer.slideMs[S.cur] >= dueMs(S.beat + 1)) {
      anchor();
    }
  }

  function setBlank(mode) {
    S.black = mode === 'black';
    S.white = mode === 'white';
  }

  function jump(a) {
    const i = resolveIndex(a);
    if (i < 0) return;
    S.cur = i;
    S.beat = clampInt(a.beat, 0, lastBeat(i), 0);
    if (i > S.furthest) {
      S.furthest = i;
      S.furthestBeat = S.beat;
    } else if (i === S.furthest) {
      S.furthestBeat = Math.max(S.furthestBeat, S.beat);
    }
    clearBlank();
    anchor();
    lastAutoAt = -Infinity;
    setNav('jump', 0, { instant: true });
  }

  function restore(a) {
    const snap = a.state;
    if (!snap || typeof snap !== 'object') return;
    const cur = snap.cur;
    if (!Number.isInteger(cur) || cur < 0 || cur >= N) return;
    if (typeof snap.key === 'string' && snap.key !== deck[cur].key) return; // deck changed: ignore
    const t = snap.timer && typeof snap.timer === 'object' ? snap.timer : {};
    S.cur = cur;
    S.beat = clampInt(snap.beat, 0, lastBeat(cur), 0);
    S.furthest = clampInt(snap.furthest, cur, N - 1, cur);
    S.furthestBeat = clampInt(
      snap.furthestBeat,
      0,
      lastBeat(S.furthest),
      S.furthest === cur ? S.beat : lastBeat(S.furthest),
    );
    S.started = !!snap.started;
    S.timer = {
      running: !!t.running,
      pausedByBack: !!t.pausedByBack && !t.running,
      globalMs: Math.max(0, num(t.globalMs)),
      slideMs: deck.map((_, i) => Math.max(0, num(Array.isArray(t.slideMs) ? t.slideMs[i] : 0))),
    };
    const gap = Math.max(0, num(a.gapMs));
    if (S.timer.running && gap > 0) {
      S.timer.globalMs += gap;
      S.timer.slideMs[cur] += gap;
    }
    if (S.timer.running || S.timer.pausedByBack) S.started = true;
    S.autoBeats = snap.autoBeats !== false;
    if (typeof snap.beatOffsetMs === 'number' && Number.isFinite(snap.beatOffsetMs)) S.beatOffsetMs = snap.beatOffsetMs;
    else anchor();
    S.black = !!snap.black;
    S.white = !!snap.white && !S.black;
    if (typeof snap.overlay === 'boolean') S.overlay = snap.overlay;
    lastAutoAt = -Infinity;
    lastNow = clock();
    setNav('restore', 0, { instant: true });
  }

  const HANDLERS = {
    next,
    prev,
    nextSlide,
    prevSlide,
    goto: (a) => goto(resolveIndex(a)),
    gotoNumber: (a) => {
      const n = Number(a.n);
      if (!Number.isInteger(n)) return;
      const i = deck.findIndex((s) => s.n === n);
      if (i >= 0) goto(i);
    },
    first: () => goto(0),
    last: () => goto(N - 1),
    start: () => {
      if (!S.timer.running) startTimer();
    },
    toggleTimer,
    resetTimer,
    toggleAutoBeats: () => setAutoBeats(!S.autoBeats),
    setAutoBeats: (a) => setAutoBeats(a.on),
    black: () => setBlank(S.black ? null : 'black'),
    white: () => setBlank(S.white ? null : 'white'),
    unblank: () => setBlank(null),
    setBlank: (a) => setBlank(a.mode === 'black' || a.mode === 'white' ? a.mode : null),
    toggleOverlay: () => {
      S.overlay = !S.overlay;
    },
    setOverlay: (a) => {
      S.overlay = !!a.on;
    },
    jump,
    restore,
  };
  HANDLERS.overlay = HANDLERS.toggleOverlay;

  // ---------- snapshot ----------
  function nextPreview() {
    if (S.beat < lastBeat(S.cur)) {
      return { kind: 'beat', index: S.cur, key: deck[S.cur].key, beat: S.beat + 1, beatsVisible: S.beat + 2 };
    }
    if (S.cur < N - 1) {
      const i = S.cur + 1;
      const b = entryBeat(i);
      return { kind: 'slide', index: i, key: deck[i].key, beat: b, beatsVisible: b + 1 };
    }
    return null;
  }

  function snapshot() {
    const s = deck[S.cur];
    const L = s.cues.length - 1;
    const slideElapsed = S.timer.slideMs[S.cur];
    const live = isLive();
    const pending = live && S.beat < L ? Math.max(0, dueMs(S.beat + 1) - slideElapsed) : null;
    return {
      v: 1,
      count: N,
      cur: S.cur,
      key: s.key,
      kind: s.kind,
      n: s.n,
      beat: S.beat,
      beats: L + 1,
      beatsVisible: S.beat + 1,
      fullyBuilt: S.beat >= L,
      furthest: S.furthest,
      furthestBeat: S.furthestBeat,
      isLive: live,
      started: S.started,
      timer: {
        running: S.timer.running,
        pausedByBack: S.timer.pausedByBack,
        globalMs: S.timer.globalMs,
        slideMs: S.timer.slideMs.slice(),
      },
      slideElapsedMs: slideElapsed,
      autoBeats: S.autoBeats,
      beatOffsetMs: S.beatOffsetMs,
      // null = no auto-beat will fire (paused, auto-beats off, fully built, or not the live slide)
      nextAutoBeatInMs: canAuto() ? pending : null,
      // time until the next cue on the live slide, even while paused / with auto-beats off
      nextBeatInMs: pending,
      plannedStartMs: plannedStart[S.cur],
      plannedDurMs: s.dur * 1000,
      plannedTotalMs: plannedTotal,
      black: S.black,
      white: S.white,
      overlay: S.overlay,
      next: nextPreview(),
      nav: { ...S.nav },
    };
  }

  function emit(snap) {
    for (const fn of [...subscribers]) {
      try {
        fn(snap);
      } catch (err) {
        onError(err);
      }
    }
  }

  // ---------- public API ----------
  function dispatch(action) {
    const a = typeof action === 'string' ? { type: action } : action;
    const handler =
      a && typeof a.type === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, a.type) ? HANDLERS[a.type] : null;
    if (!handler) return snapshot();
    accrue(); // attribute elapsed time to the slide we are leaving
    handler(a);
    const snap = snapshot();
    emit(snap);
    return snap;
  }

  function tick() {
    accrue();
    let fired = false;
    if (canAuto()) {
      const L = lastBeat(S.cur);
      while (S.beat < L && S.timer.slideMs[S.cur] >= dueMs(S.beat + 1)) {
        S.beat += 1; // auto-beats never leave the slide and do not move the schedule
        fired = true;
      }
      if (fired) {
        noteFurthestBeat();
        lastAutoAt = lastNow;
        setNav('beat', 1, { auto: true });
      }
    }
    const snap = snapshot();
    if (fired || S.timer.running) emit(snap);
    return snap;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }

  return {
    getState: snapshot,
    dispatch,
    subscribe,
    tick,
    slides: deck.map((s) => ({ ...s, cues: s.cues.slice() })),
  };
}
