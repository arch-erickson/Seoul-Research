// node --test src/engine/state.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, slidesFromTiming, DEFAULT_AUTO_GRACE_MS } from './state.js';

const timing = JSON.parse(readFileSync(new URL('../../spec/timing.json', import.meta.url), 'utf8'));

// Small fixture deck: indices 0..5
const DECK = [
  { key: 'a', kind: 'content', dur: 60, cues: [0, 10, 25] }, // 0: 3 beats
  { key: 'b', kind: 'image', dur: 10, cues: [0, 4] }, // 1: image
  { key: 'c', kind: 'content', dur: 90, cues: [0, 20, 45, 65] }, // 2: 4 beats
  { key: 'd', kind: 'content', dur: 30, cues: [0] }, // 3: 1 beat
  { key: 'e', kind: 'content', dur: 45, cues: [0, 15] }, // 4: 2 beats
  { key: 'refs', kind: 'appendix', dur: 0, cues: [0] }, // 5: appendix
];
const A = 0, B = 1, C = 2, D = 3, E = 4, REFS = 5;

/** Store with a fake clock. run() advances time in 100 ms ticks (the audience ticks ~10x/s). */
function make(opts = {}) {
  const clock = { t: 5000 };
  const store = createStore({ slides: opts.slides || DECK, now: () => clock.t, ...opts });
  const s = () => store.getState();
  const d = (type, extra = {}) => store.dispatch({ type, ...extra });
  const run = (ms, step = 100) => {
    for (let left = ms; left > 0; left -= step) {
      clock.t += Math.min(step, left);
      store.tick();
    }
    return s();
  };
  const wait = (ms) => {
    clock.t += ms; // time passes, no tick yet
  };
  const times = (type, k) => {
    for (let i = 0; i < k; i++) d(type);
    return s();
  };
  return { store, clock, s, d, run, wait, times };
}

/** Reach slide C (index 2) the normal way, manually, with no time passing. */
function toC(h) {
  h.times('next', 2); // a: beat 1, 2
  h.d('next'); // -> b
  h.d('next'); // b beat 1
  h.d('next'); // -> c
  assert.equal(h.s().cur, C);
}

// ---------------------------------------------------------------------------
describe('initial state', () => {
  test('starts on slide 0, beat 0, timer stopped and never started', () => {
    const { s } = make();
    const st = s();
    assert.equal(st.cur, 0);
    assert.equal(st.beat, 0);
    assert.equal(st.beatsVisible, 1);
    assert.equal(st.furthest, 0);
    assert.equal(st.isLive, true);
    assert.equal(st.started, false);
    assert.deepEqual(st.timer, { running: false, pausedByBack: false, globalMs: 0, slideMs: [0, 0, 0, 0, 0, 0] });
    assert.equal(st.autoBeats, true, 'auto-beats default on');
    assert.equal(st.black, false);
    assert.equal(st.white, false);
    assert.equal(st.count, DECK.length);
  });

  test('time does not run before the talk starts', () => {
    const { run } = make();
    const st = run(30000);
    assert.equal(st.timer.globalMs, 0);
    assert.equal(st.beat, 0, 'no auto-beats before the timer starts');
  });

  test('rejects an empty deck', () => {
    assert.throws(() => createStore({ slides: [] }));
  });
});

// ---------------------------------------------------------------------------
describe('forward beats', () => {
  test('next reveals the beats of the current slide in order', () => {
    const h = make();
    let st = h.d('next');
    assert.equal(st.cur, A);
    assert.equal(st.beat, 1);
    assert.equal(st.beatsVisible, 2);
    assert.equal(st.fullyBuilt, false);
    assert.equal(st.nav.type, 'beat');
    assert.equal(st.nav.dir, 1);
    st = h.d('next');
    assert.equal(st.beat, 2);
    assert.equal(st.beatsVisible, 3);
    assert.equal(st.fullyBuilt, true);
  });

  test('next on the last beat advances to the next slide at beat 0', () => {
    const h = make();
    h.times('next', 2);
    const st = h.d('next');
    assert.equal(st.cur, B);
    assert.equal(st.beat, 0);
    assert.equal(st.furthest, B);
    assert.equal(st.isLive, true);
    assert.equal(st.nav.type, 'slide');
    assert.equal(st.nav.instant, false, 'fresh slide plays its builds');
  });

  test('single-beat slides advance on the first next', () => {
    const h = make();
    toC(h);
    h.times('next', 3); // c fully built
    let st = h.d('next');
    assert.equal(st.cur, D);
    st = h.d('next');
    assert.equal(st.cur, E, 'd has one beat, so next leaves it');
  });

  test('next on the last slide fully built does nothing', () => {
    const h = make();
    h.d('goto', { index: REFS });
    const before = h.s();
    const st = h.d('next');
    assert.equal(st.cur, REFS);
    assert.equal(st.beat, before.beat);
  });

  test('nextSlide skips the remaining beats', () => {
    const h = make();
    h.d('next'); // a beat 1
    const st = h.d('nextSlide');
    assert.equal(st.cur, B);
    assert.equal(st.beat, 0);
    assert.equal(st.furthest, B);
  });

  test('the next preview describes what next will show', () => {
    const h = make();
    assert.deepEqual(h.s().next, { kind: 'beat', index: A, key: 'a', beat: 1, beatsVisible: 2 });
    h.times('next', 2);
    assert.deepEqual(h.s().next, { kind: 'slide', index: B, key: 'b', beat: 0, beatsVisible: 1 });
    h.d('goto', { index: REFS });
    assert.equal(h.s().next, null);
  });
});

// ---------------------------------------------------------------------------
describe('furthest and fully-built revisits', () => {
  test('furthest tracks the highest slide reached going forward', () => {
    const h = make();
    toC(h);
    assert.equal(h.s().furthest, C);
    h.d('prev'); // c beat 0 -> b (fully built), paused
    assert.equal(h.s().furthest, C, 'going back does not lower furthest');
  });

  test('slides before furthest are re-entered fully built going forward', () => {
    const h = make();
    toC(h);
    h.times('next', 3);
    h.d('next'); // -> d, furthest = d
    h.d('goto', { index: B }); // back to b (paused; going to slide 1 would be a full reset)
    assert.equal(h.s().beat, 1, 'b fully built');
    h.d('next'); // resume only
    let st = h.d('next'); // -> c fully built
    assert.equal(st.cur, C);
    assert.equal(st.beat, 3, 'c entered fully built');
    assert.equal(st.fullyBuilt, true);
    assert.equal(st.isLive, false);
    assert.equal(st.nav.instant, true);
    st = h.d('next'); // -> d is furthest (1 beat, it was fully built)
    assert.equal(st.cur, D);
    assert.equal(st.isLive, true);
    st = h.d('next'); // -> e is new: builds play
    assert.equal(st.cur, E);
    assert.equal(st.beat, 0);
    assert.equal(st.furthest, E);
  });

  test('re-entering a half-built live slide restores the beat reached there', () => {
    const h = make();
    toC(h);
    h.times('next', 2); // c beat 2 of 3
    h.d('goto', { index: B }); // back (paused), c left half-built
    assert.equal(h.s().furthestBeat, 2);
    h.d('next'); // resume
    const st = h.d('next'); // -> c
    assert.equal(st.cur, C);
    assert.equal(st.beat, 2, 'not fully built, not reset');
    assert.equal(st.isLive, true);
    assert.equal(st.fullyBuilt, false);
    assert.deepEqual(h.s().next, { kind: 'beat', index: C, key: 'c', beat: 3, beatsVisible: 4 });
  });
});

// ---------------------------------------------------------------------------
describe('prev', () => {
  test('on the live slide, prev un-builds beats and keeps the timer running', () => {
    const h = make();
    toC(h);
    h.times('next', 2); // c beat 2
    let st = h.d('prev');
    assert.equal(st.cur, C);
    assert.equal(st.beat, 1);
    assert.equal(st.nav.type, 'unbuild');
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.pausedByBack, false);
    st = h.d('prev');
    assert.equal(st.beat, 0);
    assert.equal(st.timer.running, true);
  });

  test('prev at beat 0 of the live slide goes to the previous slide fully built and pauses', () => {
    const h = make();
    toC(h);
    const st = h.d('prev');
    assert.equal(st.cur, B);
    assert.equal(st.beat, 1, 'b fully built');
    assert.equal(st.fullyBuilt, true);
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.pausedByBack, true);
    assert.equal(st.nav.dir, -1);
    assert.equal(st.nav.instant, true);
  });

  test('on a revisited slide prev does not un-build: it goes straight to the previous slide', () => {
    const h = make();
    toC(h);
    h.times('next', 3);
    h.d('next'); // -> d
    h.d('prev'); // c (fully built, not live)
    const st = h.d('prev');
    assert.equal(st.cur, B, 'no un-building on c');
    assert.equal(st.beat, 1, 'b fully built');
    assert.equal(st.isLive, false);
  });

  test('prev on the very first slide at beat 0 is a no-op', () => {
    const h = make();
    const st = h.d('prev');
    assert.equal(st.cur, 0);
    assert.equal(st.beat, 0);
    assert.equal(st.timer.pausedByBack, false);
  });

  test('prevSlide goes back a whole slide even mid-build', () => {
    const h = make();
    toC(h);
    h.d('next'); // c beat 1
    const st = h.d('prevSlide');
    assert.equal(st.cur, B);
    assert.equal(st.fullyBuilt, true);
    assert.equal(st.timer.pausedByBack, true);
  });
});

// ---------------------------------------------------------------------------
describe('going back pauses; the first next resumes, the second advances', () => {
  test('going back pauses the timer with pausedByBack', () => {
    const h = make();
    h.times('next', 5); // -> b -> c, timer running
    h.run(2000);
    const st = h.d('prev'); // c beat 0 -> b
    assert.equal(st.cur, B);
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.pausedByBack, true);
  });

  test('the FIRST next after going back only resumes the timer and does not move', () => {
    const h = make();
    toC(h);
    h.d('prev'); // -> b paused
    const before = h.s();
    const st = h.d('next');
    assert.equal(st.cur, before.cur, 'did not move');
    assert.equal(st.beat, before.beat, 'did not change beat');
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.pausedByBack, false);
    assert.equal(st.nav.seq, before.nav.seq, 'no navigation happened');
  });

  test('the SECOND next advances', () => {
    const h = make();
    toC(h);
    h.d('prev'); // -> b
    h.d('next'); // resume
    const st = h.d('next');
    assert.equal(st.cur, C);
    assert.equal(st.timer.running, true);
  });

  test('several back presses still need just one resume press', () => {
    const h = make();
    toC(h);
    h.times('next', 3);
    h.d('next'); // -> d
    h.times('prev', 2); // -> c -> b
    assert.equal(h.s().cur, B);
    assert.equal(h.s().timer.pausedByBack, true);
    let st = h.d('next');
    assert.equal(st.cur, B);
    assert.equal(st.timer.running, true);
    st = h.d('next');
    assert.equal(st.cur, C);
    st = h.d('next');
    assert.equal(st.cur, D);
  });

  test('un-building on the live slide does not pause (no resume press needed)', () => {
    const h = make();
    toC(h);
    h.d('next'); // c beat 1
    h.d('prev'); // un-build
    const st = h.d('next');
    assert.equal(st.beat, 1, 'next re-reveals immediately');
  });

  test('nextSlide obeys the resume-first rule too', () => {
    const h = make();
    toC(h);
    h.d('prev'); // b
    let st = h.d('nextSlide');
    assert.equal(st.cur, B);
    assert.equal(st.timer.running, true);
    st = h.d('nextSlide');
    assert.equal(st.cur, C);
  });

  test('T while paused-by-back resumes and clears the flag; next then advances', () => {
    const h = make();
    toC(h);
    h.d('prev');
    let st = h.d('toggleTimer');
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.pausedByBack, false);
    st = h.d('next');
    assert.equal(st.cur, C);
  });
});

// ---------------------------------------------------------------------------
describe('timer', () => {
  test('the first forward press starts the timer', () => {
    const h = make();
    let st = h.d('next');
    assert.equal(st.timer.running, true);
    assert.equal(st.started, true);
    st = h.run(1500);
    assert.equal(st.timer.globalMs, 1500);
    assert.equal(st.timer.slideMs[A], 1500);
  });

  test('start (presentation mode) starts the timer without moving', () => {
    const h = make();
    let st = h.d('start');
    assert.equal(st.cur, 0);
    assert.equal(st.beat, 0);
    assert.equal(st.timer.running, true);
    st = h.d('start');
    assert.equal(st.timer.running, true, 'idempotent');
  });

  test('entering a new slide starts the timer if it was stopped', () => {
    const h = make();
    h.d('next'); // start
    h.d('toggleTimer'); // manual pause
    h.d('next'); // a beat 2: a beat reveal does not restart a manually paused timer
    assert.equal(h.s().timer.running, false);
    const st = h.d('next'); // -> b
    assert.equal(st.cur, B);
    assert.equal(st.timer.running, true, '"going to the next slide, the timer starts"');
  });

  test('global time accrues only while running', () => {
    const h = make();
    h.d('start');
    h.run(5000);
    h.d('toggleTimer'); // pause
    let st = h.run(3000);
    assert.equal(st.timer.globalMs, 5000);
    h.d('toggleTimer'); // resume
    st = h.run(2000);
    assert.equal(st.timer.globalMs, 7000);
  });

  test('time paused by going back is not counted anywhere', () => {
    const h = make({ autoBeats: false });
    toC(h);
    h.run(4000); // 4 s on c
    h.d('prev'); // -> b, paused
    let st = h.run(60000);
    assert.equal(st.timer.globalMs, 4000);
    assert.equal(st.timer.slideMs[B], 0);
    assert.equal(st.timer.slideMs[C], 4000);
    h.d('next'); // resume on b
    st = h.run(1000);
    assert.equal(st.timer.slideMs[B], 1000);
    assert.equal(st.timer.globalMs, 5000);
  });

  test('per-slide time is cumulative across visits', () => {
    const h = make({ autoBeats: false });
    h.times('next', 3); // -> b, the first press starts the timer
    h.run(3000); // b: 3 s
    h.times('next', 2); // -> c
    h.run(2000); // c: 2 s
    h.d('prev'); // -> b (paused)
    h.d('next'); // resume on b
    h.run(1500); // b: +1.5 s
    h.d('next'); // -> c (the live slide)
    h.run(500); // c: +0.5 s
    const st = h.s();
    assert.equal(st.timer.slideMs[B], 4500);
    assert.equal(st.timer.slideMs[C], 2500);
    assert.equal(st.timer.globalMs, 7000);
    assert.equal(st.slideElapsedMs, 2500);
  });

  test('time is attributed to the slide being left, even without a tick in between', () => {
    const h = make({ autoBeats: false });
    h.d('start');
    h.wait(1234);
    h.times('next', 3); // leave a for b with no tick
    assert.equal(h.s().timer.slideMs[A], 1234);
    assert.equal(h.s().timer.slideMs[B], 0);
  });

  test('T toggles pause/resume', () => {
    const h = make();
    let st = h.d('toggleTimer');
    assert.equal(st.timer.running, true);
    assert.equal(st.started, true);
    st = h.d('toggleTimer');
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.pausedByBack, false);
    st = h.d('toggleTimer');
    assert.equal(st.timer.running, true);
  });

  test('Shift+T resets every timer to zero and stops', () => {
    const h = make({ autoBeats: false });
    toC(h);
    h.run(9000);
    const st = h.d('resetTimer');
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.pausedByBack, false);
    assert.equal(st.timer.globalMs, 0);
    assert.deepEqual(st.timer.slideMs, [0, 0, 0, 0, 0, 0]);
    assert.equal(st.started, false);
    assert.equal(h.run(5000).timer.globalMs, 0, 'stays stopped');
    assert.equal(st.cur, C, 'does not move');
  });

  test('after a reset the current slide is the live slide, so later builds replay', () => {
    const h = make();
    toC(h);
    h.times('next', 3);
    h.d('next'); // -> d (furthest d)
    h.d('goto', { index: B }); // back to b (paused)
    h.d('resetTimer');
    let st = h.s();
    assert.equal(st.furthest, B);
    st = h.d('next'); // b is fully built -> c at beat 0
    assert.equal(st.cur, C);
    assert.equal(st.beat, 0, 'c builds again');
    assert.equal(st.timer.running, true, 'timer starts');
  });

  test('going back before the timer ever started rewinds instead of pausing', () => {
    const h = make();
    toC(h);
    h.d('resetTimer'); // at c, nothing presented yet
    const st = h.d('goto', { index: A });
    assert.equal(st.cur, A);
    assert.equal(st.beat, 0, 'rewound to beat 0');
    assert.equal(st.furthest, A);
    assert.equal(st.timer.pausedByBack, false);
    const st2 = h.d('next');
    assert.equal(st2.beat, 1, 'no resume-only press needed: next reveals');
    assert.equal(st2.timer.running, true);
  });
});

// ---------------------------------------------------------------------------
describe('auto-beats', () => {
  function onC(opts) {
    const h = make(opts);
    h.d('goto', { index: C }); // forward beyond furthest: builds play, timer starts
    assert.equal(h.s().cur, C);
    assert.equal(h.s().beat, 0);
    assert.equal(h.s().timer.running, true);
    return h;
  }

  test('fire at the cue times while the timer runs on the live slide', () => {
    const h = onC();
    assert.equal(h.run(19900).beat, 0);
    let st = h.run(100);
    assert.equal(st.beat, 1, 'B2 at 20 s');
    assert.equal(st.nav.auto, true);
    assert.equal(h.run(24900).beat, 1);
    assert.equal(h.run(100).beat, 2, 'B3 at 45 s');
    assert.equal(h.run(19900).beat, 2);
    st = h.run(100);
    assert.equal(st.beat, 3, 'B4 at 65 s');
    assert.equal(st.fullyBuilt, true);
  });

  test('never change slide, however long the timer runs', () => {
    const h = onC();
    const st = h.run(10 * 60 * 1000, 1000);
    assert.equal(st.cur, C);
    assert.equal(st.beat, 3);
    assert.equal(st.timer.running, true);
    assert.equal(st.nextAutoBeatInMs, null);
  });

  test('nextAutoBeatInMs counts down to the next cue', () => {
    const h = onC();
    assert.equal(h.s().nextAutoBeatInMs, 20000);
    assert.equal(h.run(5000).nextAutoBeatInMs, 15000);
    h.run(15000); // B2 fires
    assert.equal(h.s().nextAutoBeatInMs, 25000);
  });

  test('an early manual beat shifts later cues by (actual - scheduled)', () => {
    const h = onC();
    h.run(12000);
    let st = h.d('next'); // B2 at 12 s instead of 20 s
    assert.equal(st.beat, 1);
    assert.equal(st.beatOffsetMs, -8000);
    assert.equal(st.nextAutoBeatInMs, 25000, 'spacing to B3 preserved');
    assert.equal(h.run(24900).beat, 1);
    assert.equal(h.run(100).beat, 2, 'B3 at 37 s = 45 - 8');
    st = h.run(19900);
    assert.equal(st.beat, 2);
    assert.equal(h.run(100).beat, 3, 'B4 at 57 s = 65 - 8');
  });

  test('a late manual beat shifts later cues later', () => {
    const h = onC();
    h.run(19000);
    h.wait(1500); // press lands at 20.5 s, before the tick that would have fired B2
    const st = h.d('next');
    assert.equal(st.beat, 1);
    assert.equal(st.beatOffsetMs, 500);
    assert.equal(h.run(24900).beat, 1);
    assert.equal(h.run(100).beat, 2, 'B3 at 45.5 s');
  });

  test('a late manual beat with auto-beats off also moves the schedule', () => {
    const h = onC({ autoBeats: false });
    h.run(30000);
    h.d('next'); // B2 at 30 s (scheduled 20 s)
    assert.equal(h.s().beatOffsetMs, 10000);
    h.d('toggleAutoBeats');
    assert.equal(h.s().nextAutoBeatInMs, 25000);
    assert.equal(h.run(24900).beat, 1);
    assert.equal(h.run(100).beat, 2, 'B3 at 55 s');
  });

  test('the offset resets on slide entry', () => {
    const h = make();
    h.d('start');
    h.d('next'); // a: B2 early at 0 s -> offset -10000
    assert.equal(h.s().beatOffsetMs, -10000);
    h.d('next'); // a: B3
    h.d('next'); // -> b
    const st = h.s();
    assert.equal(st.cur, B);
    assert.equal(st.beatOffsetMs, 0);
    assert.equal(st.nextAutoBeatInMs, 4000);
  });

  test('no auto-beats while paused with T', () => {
    const h = onC();
    h.run(10000);
    h.d('toggleTimer');
    let st = h.run(60000);
    assert.equal(st.beat, 0);
    assert.equal(st.nextAutoBeatInMs, null);
    assert.equal(st.nextBeatInMs, 10000, 'schedule frozen while paused');
    h.d('toggleTimer');
    assert.equal(h.run(9900).beat, 0);
    assert.equal(h.run(100).beat, 1, 'fires after the remaining 10 s of slide time');
  });

  test('no auto-beats while paused by going back', () => {
    const h = make();
    h.d('goto', { index: E }); // live slide e (cue 15)
    h.d('goto', { index: C }); // back: c fully built, paused
    let st = h.run(60000);
    assert.equal(st.cur, C);
    assert.equal(st.beat, 3);
    assert.equal(st.timer.slideMs[E], 0);
    h.d('next'); // resume
    h.d('next'); // -> d (fully built)
    h.d('next'); // -> e (live), its slide time is 0 still
    st = h.s();
    assert.equal(st.cur, E);
    assert.equal(st.beat, 0);
    assert.equal(h.run(14900).beat, 0);
    assert.equal(h.run(100).beat, 1);
  });

  test('no auto-beats on revisited (non-live) slides', () => {
    const h = make();
    h.d('goto', { index: E }); // furthest e
    h.d('jump', { index: C, beat: 1 }); // a revisited slide shown half-built (static positioning)
    h.d('start');
    const st = h.run(120000, 500);
    assert.equal(st.cur, C);
    assert.equal(st.isLive, false);
    assert.equal(st.beat, 1, 'nothing fired on a revisited slide');
    assert.equal(st.nextAutoBeatInMs, null);
  });

  test('turning auto-beats off stops them; turning them back on never fires a stale beat instantly', () => {
    const h = onC();
    let st = h.d('toggleAutoBeats');
    assert.equal(st.autoBeats, false);
    assert.equal(st.nextAutoBeatInMs, null);
    st = h.run(30000);
    assert.equal(st.beat, 0, 'B2 (20 s) did not fire');
    st = h.d('toggleAutoBeats');
    assert.equal(st.autoBeats, true);
    assert.equal(h.run(100).beat, 0, 'not fired instantly on re-enable');
    assert.equal(h.s().nextAutoBeatInMs, 19900, 're-anchored: full spacing from now');
  });

  test('a manual next right after an auto-beat is absorbed (grace window)', () => {
    const h = onC();
    h.run(20000); // B2 auto
    assert.equal(h.s().beat, 1);
    h.wait(300);
    let st = h.d('next'); // the speaker meant B2, which just appeared
    assert.equal(st.beat, 1, 'absorbed');
    st = h.d('next');
    assert.equal(st.beat, 2, 'the following press works');
  });

  test('the grace window cannot make the last auto-beat leave the slide', () => {
    const h = make();
    h.d('goto', { index: E });
    h.run(15000); // B2 auto, e fully built
    h.wait(200);
    let st = h.d('next');
    assert.equal(st.cur, E, 'did not leave the slide');
    h.wait(DEFAULT_AUTO_GRACE_MS + 1);
    st = h.d('next');
    assert.equal(st.cur, REFS, 'outside the window next advances');
  });

  test('a press after the grace window behaves normally', () => {
    const h = onC();
    h.run(20000);
    h.wait(DEFAULT_AUTO_GRACE_MS);
    assert.equal(h.d('next').beat, 2);
  });

  test('grace can be disabled', () => {
    const h = onC({ autoGraceMs: 0 });
    h.run(20000);
    assert.equal(h.d('next').beat, 2);
  });

  test('catches up overdue beats in one tick (e.g. a throttled timer)', () => {
    const h = onC();
    h.wait(50000);
    const st = h.store.tick();
    assert.equal(st.beat, 2, 'B2 and B3 both due at 50 s');
    assert.equal(st.cur, C);
  });

  test('un-building re-anchors the schedule so the beat does not re-fire instantly', () => {
    const h = onC();
    h.run(30000); // B2 fired at 20 s
    let st = h.d('prev'); // un-build at 30 s
    assert.equal(st.beat, 0);
    assert.equal(h.run(100).beat, 0, 'not instantly re-revealed');
    assert.equal(h.run(19800).beat, 0);
    st = h.run(100);
    assert.equal(st.beat, 1, 'B2 again after its normal 20 s spacing');
  });

  test('re-entering the half-built live slide resumes auto-beats with normal spacing', () => {
    const h = onC();
    h.run(20000); // B2 auto (beat 1)
    h.run(1000);
    h.d('goto', { index: B }); // back, paused (c left at beat 1, 21 s on it)
    h.d('next'); // resume on b
    h.run(5000);
    h.d('next'); // -> c, beat 1 restored
    let st = h.s();
    assert.equal(st.cur, C);
    assert.equal(st.beat, 1);
    assert.equal(st.nextAutoBeatInMs, 25000, 'B3 is 25 s after B2');
    assert.equal(h.run(24900).beat, 1);
    st = h.run(100);
    assert.equal(st.beat, 2);
  });

  test('auto-beats only fire through tick(), never as a side effect of dispatch', () => {
    const h = onC();
    h.wait(25000); // B2 overdue, no tick
    const st = h.d('toggleOverlay');
    assert.equal(st.beat, 0);
  });
});

// ---------------------------------------------------------------------------
describe('goto', () => {
  test('backward: target fully built, timer paused by back', () => {
    const h = make();
    toC(h);
    const st = h.d('goto', { index: B });
    assert.equal(st.cur, B);
    assert.equal(st.beat, 1);
    assert.equal(st.fullyBuilt, true);
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.pausedByBack, true);
    assert.equal(st.furthest, C);
  });

  test('forward beyond furthest: builds play, furthest moves, timer runs', () => {
    const h = make();
    const st = h.d('goto', { index: E });
    assert.equal(st.cur, E);
    assert.equal(st.beat, 0);
    assert.equal(st.furthest, E);
    assert.equal(st.isLive, true);
    assert.equal(st.timer.running, true);
  });

  test('forward to an already-presented slide: fully built, timer runs', () => {
    const h = make();
    h.d('goto', { index: E });
    h.d('goto', { index: B }); // paused
    const st = h.d('goto', { index: C });
    assert.equal(st.cur, C);
    assert.equal(st.beat, 3, 'skipped slides count as presented (before furthest)');
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.pausedByBack, false, 'an explicit goto moves immediately');
  });

  test('goto by key', () => {
    const h = make();
    assert.equal(h.d('goto', { key: 'd' }).cur, D);
  });

  test('gotoNumber uses content-slide numbers', () => {
    const h = make();
    assert.equal(h.d('gotoNumber', { n: 3 }).cur, D, 'd is the 3rd content slide');
    assert.equal(h.d('gotoNumber', { n: 1 }).cur, A);
    assert.equal(h.d('gotoNumber', { n: 4 }).cur, E);
  });

  test('invalid targets are ignored', () => {
    const h = make();
    const before = h.s();
    assert.equal(h.d('goto', { index: 99 }).cur, before.cur);
    assert.equal(h.d('goto', { index: -1 }).cur, before.cur);
    assert.equal(h.d('goto', { key: 'nope' }).cur, before.cur);
    assert.equal(h.d('gotoNumber', { n: 0 }).cur, before.cur);
    assert.equal(h.d('gotoNumber', { n: 42 }).cur, before.cur);
    assert.equal(h.d('gotoNumber', { n: 'x' }).cur, before.cur);
    assert.equal(h.s().timer.running, false, 'no timer side effects');
  });

  test('goto to the current slide is a no-op', () => {
    const h = make();
    h.times('next', 4); // -> b beat 1
    const seq = h.s().nav.seq;
    const st = h.d('goto', { index: B });
    assert.equal(st.beat, 1);
    assert.equal(st.nav.seq, seq);
  });

  test('Home and End', () => {
    const h = make();
    let st = h.d('last');
    assert.equal(st.cur, REFS);
    assert.equal(st.timer.running, true);
    st = h.d('first');
    assert.equal(st.cur, A);
    assert.equal(st.timer.pausedByBack, false, 'Home is a full reset, not a pause');
    assert.equal(st.started, false);
    assert.equal(st.beat, 0);
  });

  test('real deck: G 10 goes to content slide s10, G 20 to s20', () => {
    const store = createStore({ slides: slidesFromTiming(timing), now: () => 0 });
    assert.equal(store.dispatch({ type: 'gotoNumber', n: 10 }).key, 's10');
    assert.equal(store.dispatch({ type: 'gotoNumber', n: 20 }).key, 's20');
    assert.equal(store.dispatch({ type: 'gotoNumber', n: 1 }).key, 's01');
  });
});

// ---------------------------------------------------------------------------
describe('image slides (from spec/timing.json)', () => {
  const slides = slidesFromTiming(timing);

  test('18 image slides of exactly 10 s with beats at 0 s and 4 s', () => {
    const imgs = slides.filter((s) => s.kind === 'image');
    assert.equal(imgs.length, 18);
    for (const s of imgs) {
      assert.equal(s.dur, 10, s.key);
      assert.deepEqual(s.cues, [0, 4], s.key);
    }
  });

  test('deck order, content numbers and planned total (38:30)', () => {
    assert.equal(slides.length, 41);
    assert.equal(slides.filter((s) => s.kind === 'content').length, 20);
    assert.equal(slides[0].key, 's01');
    assert.equal(slides[1].key, 'i01');
    // the untimed appendix, then Questions and Thank You (spec/qa-slide.md): none of them adds to the 38:30 plan
    assert.deepEqual(slides.slice(-3).map((s) => s.key), ['refs', 'qa', 'thanks']);
    assert.deepEqual(slides.slice(-3).map((s) => s.dur), [0, 0, 0]);
    const st = createStore({ slides, now: () => 0 }).getState();
    assert.equal(st.plannedTotalMs, 2310 * 1000);
    assert.equal(st.n, 1);
  });

  test('an image slide auto-reveals New York at 4 s and never leaves on its own', () => {
    const clock = { t: 0 };
    const store = createStore({ slides, now: () => clock.t });
    store.dispatch('start');
    store.dispatch('next'); // s01 has one beat -> i01
    let st = store.getState();
    assert.equal(st.key, 'i01');
    assert.equal(st.plannedDurMs, 10000);
    assert.equal(st.plannedStartMs, 45000);
    assert.equal(st.nextAutoBeatInMs, 4000);
    const step = (ms) => {
      for (let i = 0; i < ms / 100; i++) {
        clock.t += 100;
        st = store.tick();
      }
    };
    step(3900);
    assert.equal(st.beat, 0, 'Seoul only');
    step(100);
    assert.equal(st.beat, 1, 'New York at 4 s');
    step(60000);
    assert.equal(st.key, 'i01', 'no auto-advance after 10 s');
    assert.equal(st.slideElapsedMs, 64000);
  });
});

// ---------------------------------------------------------------------------
describe('snapshot', () => {
  test('is plain JSON (survives a JSON round trip unchanged)', () => {
    const h = make();
    toC(h);
    h.run(3000);
    h.d('black');
    for (const st of [h.s(), h.d('prev'), h.store.tick()]) {
      assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
      assert.equal(typeof structuredClone, 'function');
      assert.deepEqual(structuredClone(st), st);
    }
  });

  test('exposes everything the presenter needs', () => {
    const h = make();
    const st = h.s();
    for (const k of [
      'cur', 'beat', 'beatsVisible', 'fullyBuilt', 'furthest', 'isLive', 'timer', 'autoBeats',
      'nextAutoBeatInMs', 'plannedStartMs', 'plannedDurMs', 'black', 'white', 'overlay', 'started',
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(st, k), k);
    }
    for (const k of ['running', 'pausedByBack', 'globalMs', 'slideMs']) assert.ok(k in st.timer, k);
  });

  test('snapshots are copies: mutating one does not touch the store', () => {
    const h = make();
    const st = h.s();
    st.timer.slideMs[0] = 999;
    st.cur = 3;
    assert.equal(h.s().timer.slideMs[0], 0);
    assert.equal(h.s().cur, 0);
  });

  test('plannedStartMs is the cumulative planned time before cur', () => {
    const h = make();
    assert.equal(h.s().plannedStartMs, 0);
    assert.equal(h.s().plannedDurMs, 60000);
    h.d('goto', { index: C });
    assert.equal(h.s().plannedStartMs, 70000);
    assert.equal(h.s().plannedDurMs, 90000);
    h.d('goto', { index: REFS });
    assert.equal(h.s().plannedStartMs, 60000 + 10000 + 90000 + 30000 + 45000);
    assert.equal(h.s().plannedTotalMs, 235000);
  });

  test('black / white / overlay toggles', () => {
    const h = make();
    let st = h.d('black');
    assert.equal(st.black, true);
    st = h.d('white');
    assert.equal(st.white, true);
    assert.equal(st.black, false, 'mutually exclusive');
    st = h.d('white');
    assert.equal(st.white, false);
    assert.equal(st.overlay, true, 'overlay on by default');
    st = h.d('toggleOverlay');
    assert.equal(st.overlay, false);
    st = h.d('overlay');
    assert.equal(st.overlay, true);
    st = h.d('setOverlay', { on: false });
    assert.equal(st.overlay, false);
    st = h.d('setBlank', { mode: 'black' });
    assert.equal(st.black, true);
    st = h.d('unblank');
    assert.equal(st.black, false);
  });

  test('next / prev while blanked only clear the blank screen', () => {
    const h = make();
    h.d('black');
    let st = h.d('next');
    assert.equal(st.black, false);
    assert.equal(st.beat, 0, 'did not advance behind the black screen');
    h.d('next'); // beat 1
    h.d('white');
    st = h.d('prev');
    assert.equal(st.white, false);
    assert.equal(st.beat, 1, 'did not go back');
  });

  test('changing slide clears black / white', () => {
    const h = make();
    h.d('black');
    assert.equal(h.d('goto', { index: C }).black, false);
  });

  test('subscribe receives a snapshot after each dispatch and each running tick', () => {
    const h = make();
    const seen = [];
    const off = h.store.subscribe((st) => seen.push(st));
    h.store.tick(); // timer not running: nothing new to say
    assert.equal(seen.length, 0);
    h.d('next');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].beat, 1);
    h.run(300);
    assert.equal(seen.length, 4);
    off();
    h.d('next');
    assert.equal(seen.length, 4);
  });

  test('a throwing subscriber does not break dispatch or other subscribers', () => {
    const errors = [];
    const h = make({ onError: (e) => errors.push(e) });
    const seen = [];
    h.store.subscribe(() => {
      throw new Error('boom');
    });
    h.store.subscribe((st) => seen.push(st.beat));
    const st = h.d('next');
    assert.equal(st.beat, 1);
    assert.deepEqual(seen, [1]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'boom');
  });

  test('dispatch accepts a bare string and ignores unknown actions', () => {
    const h = make();
    assert.equal(h.store.dispatch('next').beat, 1);
    const before = h.s();
    assert.deepEqual(h.store.dispatch({ type: 'nope' }), before);
    assert.deepEqual(h.store.dispatch(null), before);
    assert.deepEqual(h.store.dispatch({ type: 'toString' }), before, 'no prototype lookups');
  });

  test('nav.seq increments on every slide/beat change and nowhere else', () => {
    const h = make();
    const s0 = h.s().nav.seq;
    h.d('toggleTimer');
    h.d('black');
    h.d('black');
    assert.equal(h.s().nav.seq, s0);
    h.d('next');
    assert.equal(h.s().nav.seq, s0 + 1);
  });
});

// ---------------------------------------------------------------------------
describe('jump and restore', () => {
  test('jump positions without timer side effects (static screenshots)', () => {
    const h = make();
    const st = h.d('jump', { key: 'c', beat: 2 });
    assert.equal(st.cur, C);
    assert.equal(st.beat, 2);
    assert.equal(st.furthest, C);
    assert.equal(st.timer.running, false);
    assert.equal(st.started, false);
    assert.equal(st.nav.instant, true);
    assert.equal(h.d('jump', { index: C, beat: 99 }).beat, 3, 'beat clamped');
  });

  test('restore re-applies a snapshot (e.g. after a reload)', () => {
    const h = make({ autoBeats: false });
    toC(h);
    h.d('next');
    h.run(7000);
    h.d('prev'); // un-build
    h.d('goto', { index: B }); // paused by back
    const saved = JSON.parse(JSON.stringify(h.s()));

    const h2 = make();
    const st = h2.d('restore', { state: saved });
    assert.equal(st.cur, B);
    assert.equal(st.beat, saved.beat);
    assert.equal(st.furthest, C);
    assert.equal(st.furthestBeat, 1);
    assert.equal(st.timer.pausedByBack, true);
    assert.equal(st.timer.globalMs, 7000);
    assert.deepEqual(st.timer.slideMs, saved.timer.slideMs);
    assert.equal(st.autoBeats, false);
    // and it behaves the same afterwards: resume, then advance to c at beat 1
    h2.d('next');
    const st2 = h2.d('next');
    assert.equal(st2.cur, C);
    assert.equal(st2.beat, 1);
  });

  test('restore adds the reload gap to a running timer', () => {
    const h = make();
    h.d('start');
    h.run(2000);
    const saved = h.s();
    const h2 = make();
    const st = h2.d('restore', { state: saved, gapMs: 800 });
    assert.equal(st.timer.globalMs, 2800);
    assert.equal(st.timer.running, true);
    assert.equal(h2.run(200).timer.globalMs, 3000);
  });

  test('restore ignores snapshots from a different deck', () => {
    const h = make();
    const st = h.d('restore', { state: { cur: 2, key: 'zzz', beat: 1 } });
    assert.equal(st.cur, 0);
    assert.equal(h.d('restore', { state: { cur: 99 } }).cur, 0);
    assert.equal(h.d('restore', {}).cur, 0);
  });
});

// ---------------------------------------------------------------------------
describe('the user scenario, end to end', () => {
  test('go back mid-talk: pause, resume on the first press, advance on the second, timer restarts on entry', () => {
    const clock = { t: 0 };
    const slides = slidesFromTiming(timing);
    const store = createStore({ slides, now: () => clock.t });
    const run = (ms) => {
      for (let i = 0; i < ms / 100; i++) {
        clock.t += 100;
        store.tick();
      }
      return store.getState();
    };
    store.dispatch('start'); // P
    run(45000);
    store.dispatch('next'); // -> i01
    run(10000); // Seoul, New York at 4 s
    assert.equal(store.getState().beat, 1);
    store.dispatch('next'); // -> s02, B1
    let st = run(20000); // B2 auto at 20 s
    assert.equal(st.key, 's02');
    assert.equal(st.beat, 1);
    // speaker goes back to the image slide
    store.dispatch('prev'); // un-build B2 (live slide)
    store.dispatch('prev'); // -> i01, fully built, paused
    st = store.getState();
    assert.equal(st.key, 'i01');
    assert.equal(st.fullyBuilt, true);
    assert.equal(st.timer.pausedByBack, true);
    const frozen = st.timer.globalMs;
    st = run(15000);
    assert.equal(st.timer.globalMs, frozen, 'stopped while looking back');
    st = store.dispatch('next'); // first press: resume only
    assert.equal(st.key, 'i01');
    assert.equal(st.timer.running, true);
    run(3000);
    st = store.dispatch('next'); // second press: s02
    assert.equal(st.key, 's02');
    assert.equal(st.isLive, true);
    assert.equal(st.beat, 1, 'returns where it was (B2), not fully built');
    assert.equal(st.timer.slideMs[1], 13000, 'i01 time is cumulative: 10 s + 3 s');
    assert.equal(st.timer.globalMs, 45000 + 10000 + 20000 + 3000);
  });
});

// ---------------------------------------------------------------------------
describe('going to slide 1 is a full reset (user: "going to the first screen resets all the timers")', () => {
  /** Everything as on a fresh load. */
  function assertPristine(st, msg = '') {
    assert.equal(st.cur, A, msg + ' cur');
    assert.equal(st.beat, 0, msg + ' beat');
    assert.equal(st.furthest, 0, msg + ' furthest');
    assert.equal(st.furthestBeat, 0, msg + ' furthestBeat');
    assert.equal(st.started, false, msg + ' started');
    assert.equal(st.timer.running, false, msg + ' running');
    assert.equal(st.timer.pausedByBack, false, msg + ' pausedByBack');
    assert.equal(st.timer.globalMs, 0, msg + ' globalMs');
    assert.deepEqual(st.timer.slideMs, new Array(DECK.length).fill(0), msg + ' slideMs');
    assert.equal(st.slideElapsedMs, 0, msg + ' slideElapsedMs');
    assert.equal(st.beatOffsetMs, 0, msg + ' beatOffsetMs');
    assert.equal(st.black, false, msg + ' black');
    assert.equal(st.white, false, msg + ' white');
    assert.equal(st.isLive, true, msg + ' isLive');
    assert.equal(st.nav.type, 'reset', msg + ' nav.type');
    assert.equal(st.nav.instant, true, msg + ' nav.instant');
  }
  /** A talk in progress: on slide c with time on a, b and c, timer running. */
  function talk() {
    const h = make();
    h.d('start');
    h.run(4000); // a
    h.times('next', 3); // -> b
    h.run(3000);
    h.times('next', 2); // -> c
    h.run(2500);
    const st = h.s();
    assert.equal(st.cur, C);
    assert.ok(st.timer.globalMs > 9000 && st.timer.running && st.started);
    return h;
  }

  test('Back from slide 2 to slide 1 resets everything and bumps nav.seq', () => {
    const h = make();
    h.d('start');
    h.run(4000);
    h.times('next', 3); // -> b (beat 0, live)
    h.run(2000);
    const seq = h.s().nav.seq;
    const st = h.d('prev');
    assertPristine(st, 'prev b -> a');
    assert.ok(st.nav.seq > seq, 'views re-render');
  });

  test('Back un-builds the live slide 2 first, then the next Back resets', () => {
    const h = make();
    h.times('next', 4); // -> b beat 1
    h.run(1000);
    let st = h.d('prev');
    assert.equal(st.cur, B);
    assert.equal(st.beat, 0);
    assert.equal(st.started, true, 'un-building does not reset');
    st = h.d('prev');
    assertPristine(st);
  });

  test('Back several slides: pause on the way, full reset on arrival at slide 1', () => {
    const h = talk();
    let st = h.d('prev'); // c beat 0 -> b (paused)
    assert.equal(st.cur, B);
    assert.equal(st.timer.pausedByBack, true);
    assert.ok(st.timer.globalMs > 0);
    st = h.d('prev'); // b not live -> a
    assertPristine(st);
  });

  test('Shift+Left (prevSlide) to slide 1 resets, also mid-build', () => {
    const h = make();
    h.times('next', 3); // -> b beat 0
    h.run(500);
    assertPristine(h.d('prevSlide'));
    const h2 = talk();
    h2.d('prevSlide'); // c -> b paused
    assertPristine(h2.d('prevSlide'));
  });

  test('Home (first) from any slide resets', () => {
    const h = talk();
    assertPristine(h.d('first'));
  });

  test('goto slide 1 by index or key resets', () => {
    const h = talk();
    assertPristine(h.d('goto', { index: A }));
    const h2 = talk();
    assertPristine(h2.d('goto', { key: 'a' }));
  });

  test('gotoNumber 1 (G 1 Enter) resets', () => {
    const h = talk();
    assertPristine(h.d('gotoNumber', { n: 1 }));
  });

  test('Back on slide 1 itself resets, even mid-build and with the timer running', () => {
    const h = make();
    h.d('start');
    h.run(3000);
    h.d('next'); // a beat 1
    h.run(1000);
    const st = h.d('prev');
    assertPristine(st);
    // pressed again on a pristine deck: still pristine
    assertPristine(h.d('prev'));
    assertPristine(h.d('prevSlide'));
  });

  test('Home on slide 1 itself resets', () => {
    const h = make();
    h.d('start');
    h.run(5000);
    const seq = h.s().nav.seq;
    const st = h.d('first');
    assertPristine(st);
    assert.ok(st.nav.seq > seq);
  });

  test('Home clears black / white; Back while blank only clears it first', () => {
    const h = talk();
    h.d('black');
    assertPristine(h.d('first'));
    const h2 = make();
    h2.d('start');
    h2.run(2000);
    h2.d('white');
    let st = h2.d('prev');
    assert.equal(st.white, false);
    assert.equal(st.started, true, 'the first back only shows the slide again');
    st = h2.d('prev');
    assertPristine(st);
  });

  test('after a reset the timer stays at 0:00 until the next forward press, which starts it from 0:00', () => {
    const h = talk();
    h.d('first');
    let st = h.run(5000);
    assert.equal(st.timer.globalMs, 0, 'stopped');
    assert.equal(st.timer.running, false);
    st = h.d('next');
    assert.equal(st.started, true);
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.pausedByBack, false);
    assert.equal(st.timer.globalMs, 0);
    assert.equal(st.cur, A);
    assert.equal(st.beat, 1, 'the press also reveals the next beat, as on a fresh load');
    st = h.run(1000);
    assert.equal(st.timer.globalMs, 1000);
    assert.equal(st.timer.slideMs[A], 1000);
    assert.equal(st.timer.slideMs[C], 0, 'old slide times are gone');
  });

  test('after a reset P (start) and T (toggleTimer) start the clock from 0:00', () => {
    for (const type of ['start', 'toggleTimer']) {
      const h = talk();
      h.d('goto', { index: A });
      let st = h.d(type);
      assert.equal(st.timer.running, true, type);
      assert.equal(st.started, true, type);
      assert.equal(st.cur, A, type);
      assert.equal(st.beat, 0, type);
      st = h.run(700);
      assert.equal(st.timer.globalMs, 700, type);
    }
  });

  test('after a reset builds replay and slides are entered at beat 0 again', () => {
    const h = talk();
    h.d('first');
    h.times('next', 2); // a beat 1, 2
    const st = h.d('next'); // -> b
    assert.equal(st.cur, B);
    assert.equal(st.beat, 0, 'b builds again');
    assert.equal(st.isLive, true);
    assert.equal(st.nav.instant, false);
  });

  test('after a reset the auto-beat schedule starts from slide 1 cue 0', () => {
    const h = talk();
    h.d('first');
    h.d('start');
    let st = h.run(9900);
    assert.equal(st.beat, 0);
    st = h.run(200); // cue 10 s on a
    assert.equal(st.beat, 1);
  });

  test('a reset keeps the settings (auto-beats, overlay)', () => {
    const h = talk();
    h.d('toggleAutoBeats');
    h.d('toggleOverlay');
    const st = h.d('first');
    assert.equal(st.autoBeats, false);
    assert.equal(st.overlay, false);
  });

  test('jump and restore to slide 1 do not reset', () => {
    const h = talk();
    const before = h.s();
    let st = h.d('jump', { index: A, beat: 0 });
    assert.equal(st.cur, A);
    assert.equal(st.started, true);
    assert.ok(st.timer.globalMs >= before.timer.globalMs);
    st = h.d('restore', { state: { ...before, cur: A, key: 'a', beat: 0 } });
    assert.equal(st.started, true);
    assert.ok(st.timer.globalMs > 0);
  });

  test('real deck: Back from i01 to s01 resets; the next press starts from 0:00', () => {
    const h = make({ slides: slidesFromTiming(timing) });
    h.d('start');
    h.run(5000);
    let st = h.d('next'); // s01 has one beat -> i01
    assert.equal(st.key, 'i01');
    h.run(3000);
    st = h.d('prev');
    assert.equal(st.key, 's01');
    assert.equal(st.started, false);
    assert.equal(st.timer.running, false);
    assert.equal(st.timer.globalMs, 0);
    assert.ok(st.timer.slideMs.every((v) => v === 0), 'every slide timer, the Questions countdown too');
    st = h.d('next');
    assert.equal(st.key, 'i01');
    assert.equal(st.timer.running, true);
    assert.equal(st.timer.globalMs, 0);
    st = h.run(1000);
    assert.equal(st.timer.globalMs, 1000);
  });
});
