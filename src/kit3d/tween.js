// Tween + state animator following the deck's motion language:
// arrivals ease-out, departures ease-in, internal movement ease-in-out, 400–1200 ms, no bounce.
import { MOTION } from './tokens.js';

export const ease = {
  linear: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  in: t => t * t * t,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;
// sub-range of a 0..1 progress, optionally eased: sub(p, 0.2, 0.6) is 0 before 0.2 and 1 after 0.6
export const sub = (p, a, b, fn = null) => {
  const t = clamp01((p - a) / (b - a));
  return fn ? fn(t) : t;
};

// Animator: named scalar props, each with an apply(value) side effect.
// to(targets, { instant, plan }) tweens every prop whose target differs from its current value.
export class Animator {
  constructor(stage) {
    this.stage = stage;
    this.props = new Map();
    this.active = new Map();
    this._resolvers = [];
    this.reduced = false;
  }
  prop(name, initial, apply, opts = {}) {
    const p = { name, value: initial, apply, opts };
    this.props.set(name, p);
    apply(initial);
    return p;
  }
  get(name) { return this.props.get(name).value; }
  set(name, v) {
    const p = this.props.get(name);
    if (!p) return;
    this.active.delete(name);
    p.value = v;
    p.apply(v);
  }
  // plan(name, from, to, dir) -> { delay, dur, ease }
  to(targets, { instant = false, plan = null, dir = 1 } = {}) {
    // settle any previous promise immediately (superseded)
    for (const r of this._resolvers.splice(0)) r();
    const jobs = [];
    for (const [name, target] of Object.entries(targets)) {
      const p = this.props.get(name);
      if (!p) continue;
      if (instant || this.reduced) { this.set(name, target); continue; }
      if (Math.abs(p.value - target) < 1e-6) { this.active.delete(name); continue; }
      const d = Object.assign(defaultPlan(p, p.value, target, dir), plan ? plan(name, p.value, target, dir) || {} : {});
      jobs.push({ p, from: p.value, to: target, delay: d.delay || 0, dur: Math.max(1, d.dur), ease: d.ease, t0: null });
    }
    this.stage.requestRender();
    if (!jobs.length) return Promise.resolve();
    for (const j of jobs) this.active.set(j.p.name, j);
    this.stage.startLoop();
    return new Promise(res => this._resolvers.push(res));
  }
  tick(now) {
    if (!this.active.size) return false;
    for (const [name, j] of this.active) {
      if (j.t0 === null) j.t0 = now;
      const t = (now - j.t0 - j.delay) / j.dur;
      if (t <= 0) continue;
      const k = t >= 1 ? 1 : j.ease(t);
      j.p.value = j.from + (j.to - j.from) * k;
      j.p.apply(j.p.value);
      if (t >= 1) this.active.delete(name);
    }
    if (!this.active.size) {
      for (const r of this._resolvers.splice(0)) r();
      return false;
    }
    return true;
  }
  stop() {
    this.active.clear();
    for (const r of this._resolvers.splice(0)) r();
  }
}

function defaultPlan(p, from, to, dir) {
  const o = p.opts;
  const kind = o.kind || 'move';
  let e;
  if (kind === 'reveal' || kind === 'fade') e = to > from ? ease.out : ease.in;
  else e = ease.inOut;
  let dur = o.dur ?? MOTION.base;
  let delay = o.delay ?? 0;
  if (dir < 0) { dur = Math.min(dur, 650) * 0.8; delay = Math.min(delay, 250) * 0.4; }
  return { delay, dur, ease: e };
}
