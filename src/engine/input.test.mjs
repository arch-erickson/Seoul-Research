// node --test src/engine/input.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bindKeys, bindWheel, resolveKey, isEditableTarget } from './input.js';
import { createStore } from './state.js';

function codeFor(key) {
  if (/^[a-z]$/i.test(key)) return 'Key' + key.toUpperCase();
  if (/^[0-9]$/.test(key)) return 'Digit' + key;
  if (key === ' ') return 'Space';
  if (key === '.') return 'Period';
  if (key === ',') return 'Comma';
  if (key === '?') return 'Slash';
  return key;
}

function ev(key, extra = {}) {
  return {
    key,
    code: codeFor(key),
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    target: { tagName: 'BODY' },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...extra,
  };
}

function setup(hookOverrides = {}, opts) {
  const listeners = new Set();
  const target = {
    addEventListener(type, fn) {
      if (type === 'keydown') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'keydown') listeners.delete(fn);
    },
  };
  const actions = [];
  const calls = [];
  const prompts = [];
  const hooks = {
    present: () => calls.push('present'),
    openPresenter: () => calls.push('openPresenter'),
    fullscreen: () => calls.push('fullscreen'),
    help: () => calls.push('help'),
    escape: () => calls.push('escape'),
    gotoPrompt: (t) => prompts.push(t),
    ...hookOverrides,
  };
  const dispatch = (a) => {
    actions.push(a.type === 'gotoNumber' ? `gotoNumber:${a.n}` : a.type);
    calls.push(`dispatch:${a.type}`);
  };
  const unbind = bindKeys(target, dispatch, hooks, opts);
  const press = (key, extra) => {
    const e = ev(key, extra);
    for (const fn of [...listeners]) fn(e);
    return e;
  };
  return { press, actions, calls, prompts, unbind, listeners };
}

describe('navigation keys', () => {
  test('forward: Right, Down, Space, Enter, PageDown (clicker forward)', () => {
    const h = setup();
    for (const k of ['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown']) {
      const e = h.press(k);
      assert.equal(e.defaultPrevented, true, `${k} default prevented (no scrolling)`);
    }
    assert.deepEqual(h.actions, ['next', 'next', 'next', 'next', 'next']);
  });

  test('back: Left, Up, PageUp (clicker back), Backspace, Shift+Space', () => {
    const h = setup();
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) h.press(k);
    h.press(' ', { shiftKey: true });
    assert.deepEqual(h.actions, ['prev', 'prev', 'prev', 'prev', 'prev']);
  });

  test('Shift+Right / N skip to the next slide, Shift+Left back a whole slide', () => {
    const h = setup();
    h.press('ArrowRight', { shiftKey: true });
    h.press('n');
    h.press('N', { shiftKey: true });
    h.press('ArrowLeft', { shiftKey: true });
    assert.deepEqual(h.actions, ['nextSlide', 'nextSlide', 'nextSlide', 'prevSlide']);
  });

  test('Home / End', () => {
    const h = setup();
    h.press('Home');
    h.press('End');
    assert.deepEqual(h.actions, ['first', 'last']);
  });

  test('auto-repeat is ignored (a held key cannot race through slides) but still prevents scrolling', () => {
    const h = setup();
    h.press('PageDown');
    for (let i = 0; i < 20; i++) {
      const e = h.press('PageDown', { repeat: true });
      assert.equal(e.defaultPrevented, true);
    }
    h.press('ArrowLeft', { repeat: true });
    h.press('t', { repeat: true });
    assert.deepEqual(h.actions, ['next']);
  });
});

describe('ignored keys', () => {
  test('keys typed into inputs, textareas, selects and contenteditable are ignored', () => {
    const h = setup();
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
      const e = h.press('ArrowRight', { target });
      assert.equal(e.defaultPrevented, false);
      h.press('t', { target });
      h.press('g', { target });
    }
    assert.deepEqual(h.actions, []);
    assert.deepEqual(h.prompts, []);
  });

  test('Ctrl / Alt / Meta combinations are left to the browser', () => {
    const h = setup();
    const e = h.press('r', { ctrlKey: true });
    h.press('ArrowRight', { altKey: true });
    h.press('t', { metaKey: true });
    assert.equal(e.defaultPrevented, false);
    assert.deepEqual(h.actions, []);
  });

  test('unmapped keys are not prevented', () => {
    const h = setup();
    for (const k of ['x', 'F12', 'Shift', '7']) assert.equal(h.press(k).defaultPrevented, false, k);
    assert.deepEqual(h.actions, []);
  });

  test('isEditableTarget', () => {
    assert.equal(isEditableTarget(null), false);
    assert.equal(isEditableTarget({ tagName: 'BUTTON' }), false);
    assert.equal(isEditableTarget({ tagName: 'input' }), true);
    assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  });
});

describe('command keys', () => {
  test('T toggles the timer, Shift+T resets it (Caps Lock T still toggles)', () => {
    const h = setup();
    h.press('t');
    h.press('T', { shiftKey: true });
    h.press('T'); // caps lock, no shift
    assert.deepEqual(h.actions, ['toggleTimer', 'resetTimer', 'toggleTimer']);
  });

  test('A auto-beats, O overlay, B / . black, W / , white', () => {
    const h = setup();
    for (const k of ['a', 'o', 'b', '.', 'w', ',']) h.press(k);
    assert.deepEqual(h.actions, ['toggleAutoBeats', 'toggleOverlay', 'black', 'black', 'white', 'white']);
  });

  test('P calls the present hook first, then starts the timer', () => {
    const h = setup();
    h.press('p');
    assert.deepEqual(h.calls, ['present', 'dispatch:start']);
  });

  test('F5 / Shift+F5 (clicker slideshow button) present and never reload the page', () => {
    const h = setup();
    const e = h.press('F5');
    const e2 = h.press('F5', { shiftKey: true });
    assert.equal(e.defaultPrevented, true);
    assert.equal(e2.defaultPrevented, true);
    assert.deepEqual(h.calls, ['present', 'dispatch:start', 'present', 'dispatch:start']);
  });

  test('Shift+P presenter window, F fullscreen, ? help', () => {
    const h = setup();
    h.press('P', { shiftKey: true });
    h.press('f');
    h.press('?', { shiftKey: true });
    assert.deepEqual(h.calls, ['openPresenter', 'fullscreen', 'help']);
  });

  test('Esc closes overlays (hook) and clears black / white', () => {
    const h = setup();
    h.press('Escape');
    assert.deepEqual(h.calls, ['escape', 'dispatch:unblank']);
  });

  test('letters work under a non-Latin input method (matched by physical code)', () => {
    const h = setup();
    h.press('Process', { code: 'KeyT' });
    h.press('ㅁ', { code: 'KeyA' });
    assert.deepEqual(h.actions, ['toggleTimer', 'toggleAutoBeats']);
  });

  test('a hook that throws does not block the action', () => {
    const orig = console.error;
    console.error = () => {};
    try {
      const h = setup({
        present: () => {
          throw new Error('no screens');
        },
      });
      h.press('p');
      assert.deepEqual(h.actions, ['start']);
    } finally {
      console.error = orig;
    }
  });

  test('missing hooks are fine', () => {
    const actions = [];
    const listeners = [];
    bindKeys({ addEventListener: (t, f) => listeners.push(f), removeEventListener() {} }, (a) => actions.push(a.type));
    for (const k of ['f', '?', 'p', 'g', '1', 'Enter']) listeners[0](ev(k));
    assert.deepEqual(actions, ['start', 'gotoNumber']);
  });
});

describe('G + digits + Enter', () => {
  test('goes to the typed content-slide number and shows the digits as they are typed', () => {
    const h = setup();
    h.press('g');
    h.press('1');
    h.press('2');
    h.press('Enter');
    assert.deepEqual(h.actions, ['gotoNumber:12'], 'Enter submits instead of advancing');
    assert.deepEqual(h.prompts, ['', '1', '12', null]);
  });

  test('numpad digits work', () => {
    const h = setup();
    h.press('g');
    h.press('7', { code: 'Numpad7' });
    h.press('Enter', { code: 'NumpadEnter' });
    assert.deepEqual(h.actions, ['gotoNumber:7']);
  });

  test('Backspace edits; Backspace on an empty prompt closes it', () => {
    const h = setup();
    h.press('g');
    h.press('1');
    h.press('Backspace');
    h.press('9');
    h.press('Enter');
    assert.deepEqual(h.actions, ['gotoNumber:9']);
    assert.deepEqual(h.prompts, ['', '1', '', '9', null]);
    h.press('g');
    h.press('Backspace');
    assert.equal(h.prompts.at(-1), null);
    assert.deepEqual(h.actions, ['gotoNumber:9'], 'closing with Backspace does not go back a slide');
  });

  test('Escape cancels without navigating', () => {
    const h = setup();
    h.press('g');
    h.press('5');
    h.press('Escape');
    assert.deepEqual(h.actions, []);
    assert.equal(h.prompts.at(-1), null);
    assert.deepEqual(h.calls, [], 'Esc only closed the prompt');
  });

  test('Enter with nothing typed just closes the prompt', () => {
    const h = setup();
    h.press('g');
    h.press('Enter');
    assert.deepEqual(h.actions, []);
    assert.deepEqual(h.prompts, ['', null]);
  });

  test('any other key closes the prompt and does its normal job', () => {
    const h = setup();
    h.press('g');
    h.press('1');
    h.press('PageDown');
    assert.deepEqual(h.actions, ['next']);
    assert.deepEqual(h.prompts, ['', '1', null]);
  });

  test('a lone Shift press does not close the prompt', () => {
    const h = setup();
    h.press('g');
    h.press('Shift', { shiftKey: true, code: 'ShiftLeft' });
    h.press('4');
    h.press('Enter');
    assert.deepEqual(h.actions, ['gotoNumber:4']);
  });

  test('at most three digits are kept', () => {
    const h = setup();
    h.press('g');
    for (const k of ['1', '2', '3', '4']) h.press(k);
    h.press('Enter');
    assert.deepEqual(h.actions, ['gotoNumber:123']);
  });

  test('the prompt times out so a stray G cannot swallow a later Enter', async () => {
    const h = setup({}, { gotoTimeoutMs: 20 });
    h.press('g');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(h.prompts.at(-1), null);
    h.press('Enter');
    assert.deepEqual(h.actions, ['next']);
  });

  test('unbind removes the listener and closes an open prompt', () => {
    const h = setup();
    h.press('g');
    h.unbind();
    assert.equal(h.listeners.size, 0);
    assert.equal(h.prompts.at(-1), null);
  });
});

describe('resolveKey', () => {
  test('is a pure mapping', () => {
    assert.deepEqual(resolveKey(ev('PageDown')), { action: { type: 'next' } });
    assert.deepEqual(resolveKey(ev('g')), { goto: true });
    assert.equal(resolveKey(ev('x')), null);
  });
});

describe('with the real store', () => {
  test('a clicker drives the deck; a stuck PageDown does not skip slides', () => {
    const slides = [
      { key: 'a', kind: 'content', dur: 30, cues: [0, 10] },
      { key: 'b', kind: 'content', dur: 30, cues: [0] },
      { key: 'c', kind: 'content', dur: 30, cues: [0] },
    ];
    const store = createStore({ slides, now: () => 0 });
    const listeners = [];
    bindKeys({ addEventListener: (t, f) => listeners.push(f), removeEventListener() {} }, store.dispatch);
    const press = (k, x) => listeners[0](ev(k, x));
    press('PageDown'); // a beat 1
    for (let i = 0; i < 30; i++) press('PageDown', { repeat: true });
    assert.equal(store.getState().cur, 0);
    assert.equal(store.getState().beat, 1);
    press('PageDown'); // -> b
    press('PageUp'); // -> a, paused by back
    assert.equal(store.getState().timer.pausedByBack, true);
    press('PageDown'); // resume only
    assert.equal(store.getState().cur, 0);
    press('PageDown'); // -> b
    assert.equal(store.getState().cur, 1);
    press('g');
    press('3');
    press('Enter');
    assert.equal(store.getState().cur, 2);
  });
});

describe('Norwii N27 native buttons', () => {
  test('hyperlink button (Tab) toggles the timer and never moves focus; Shift+Tab too', () => {
    for (const extra of [{}, { shiftKey: true }]) {
      const e = ev('Tab', extra);
      assert.deepEqual(resolveKey(e), { action: { type: 'toggleTimer' } });
    }
  });
  test('its long press (Alt+Tab) is left to Windows', () => {
    const fired = [];
    const listeners = [];
    bindKeys({ addEventListener: (t, fn) => listeners.push(fn), removeEventListener() {} }, (a) => fired.push(a));
    const e = ev('Tab', { altKey: true });
    listeners.forEach((fn) => fn(e));
    assert.equal(fired.length, 0);
    assert.equal(e.defaultPrevented, false);
  });
  test('all four N27 modes drive next/prev', () => {
    const next = ['ArrowRight', 'PageDown', 'ArrowDown', 'Enter'];
    const prev = ['ArrowLeft', 'PageUp', 'ArrowUp'];
    for (const k of next) assert.equal(resolveKey(ev(k)).action.type, 'next', k);
    for (const k of prev) assert.equal(resolveKey(ev(k)).action.type, 'prev', k);
  });
  test('long-press slideshow (F5 / Shift+F5) presents; long-press black (B or .) blacks out', () => {
    assert.equal(resolveKey(ev('F5')).hook, 'present');
    assert.equal(resolveKey(ev('F5', { shiftKey: true })).hook, 'present');
    assert.equal(resolveKey(ev('b')).action.type, 'black');
    assert.equal(resolveKey(ev('.')).action.type, 'black');
  });
});

describe('bindWheel (N27 scroll-wheel mode)', () => {
  function wheelSetup(opts = {}) {
    let fn = null;
    let t = 0;
    const fired = [];
    const target = { addEventListener: (type, f) => { if (type === 'wheel') fn = f; }, removeEventListener: () => { fn = null; } };
    const unbind = bindWheel(target, (a) => fired.push(a.type), { now: () => t, ...opts });
    const wheel = (deltaY, at, extra = {}) => {
      t = at;
      const e = { deltaY, deltaMode: 0, ctrlKey: false, metaKey: false, target: { tagName: 'DIV' }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      if (fn) fn(e);
      return e;
    };
    return { fired, wheel, unbind };
  }
  test('one notch down = next, one notch up = prev', () => {
    const { fired, wheel } = wheelSetup();
    wheel(100, 0);
    wheel(-100, 1000);
    assert.deepEqual(fired, ['next', 'prev']);
  });
  test('a long inertial trackpad glide triggers only one step', () => {
    const { fired, wheel } = wheelSetup();
    for (let i = 0; i < 40; i++) wheel(60, i * 16); // 640 ms of continuous scrolling
    assert.deepEqual(fired, ['next']);
    wheel(100, 640 + 400); // after a quiet gap, the next press works again
    assert.deepEqual(fired, ['next', 'next']);
  });
  test('tiny deltas are ignored; line-mode wheels are scaled', () => {
    const { fired, wheel } = wheelSetup();
    wheel(5, 0);
    wheel(3, 1000, { deltaMode: 1 }); // 3 lines = 120 px
    assert.deepEqual(fired, ['next']);
  });
  test('Ctrl+wheel (zoom) and ignored areas scroll normally', () => {
    const { fired, wheel } = wheelSetup({ ignore: (e) => e.target.scrollable === true });
    const z = wheel(100, 0, { ctrlKey: true });
    const n = wheel(100, 1000, { target: { tagName: 'DIV', scrollable: true } });
    assert.deepEqual(fired, []);
    assert.equal(z.defaultPrevented, false);
    assert.equal(n.defaultPrevented, false);
  });
  test('drives the real store', () => {
    const store = createStore({ slides: [{ key: 's01', kind: 'content', dur: 45, cues: [0] }, { key: 's02', kind: 'content', dur: 90, cues: [0, 20] }], now: () => 0 });
    let fn = null;
    let t = 0;
    bindWheel({ addEventListener: (type, f) => { fn = f; } }, (a) => store.dispatch(a), { now: () => t });
    const before = store.getState().cur;
    t = 0; fn({ deltaY: 100, deltaMode: 0, target: { tagName: 'DIV' }, preventDefault() {} });
    assert.notDeepEqual(store.getState(), null);
    assert.ok(store.getState().cur >= before);
  });
});
