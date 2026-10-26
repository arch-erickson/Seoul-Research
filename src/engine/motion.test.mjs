import test from 'node:test';
import assert from 'node:assert/strict';

// Small DOM/clock doubles: formatting is exercised through the public API.
class Element {
  constructor(text = '', motion) {
    this.style = { opacity: '', transform: '', position: '', display: '' };
    this.dataset = motion ? { motion } : {};
    this.attrs = {}; this.childNodes = []; this.box = { width: 200, height: 30 };
    this.ownerDocument = { createElement: () => new Element() };
    if (text) this.textContent = text;
  }
  get children() { return this.childNodes.filter(n => n instanceof Element); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren({ textContent: String(v) }); }
  appendChild(n) {
    if (n.parent) n.parent.childNodes.splice(n.parent.childNodes.indexOf(n), 1);
    this.childNodes.push(n); n.parent = this; return n;
  }
  replaceChildren(...nodes) { this.childNodes.forEach(n => { n.parent = null; }); this.childNodes = []; nodes.forEach(n => this.appendChild(n)); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getBoundingClientRect() { return this.box; }
  matches(s) { return s === '[data-motion]' ? !!this.dataset.motion : s === '[data-motion="photo"]' && this.dataset.motion === 'photo'; }
  querySelectorAll(s) { return this.children.flatMap(n => [...(n.matches(s) ? [n] : []), ...n.querySelectorAll(s)]); }
  querySelector(s) { return s.includes('figcaption') ? this.caption || null : this.querySelectorAll(s)[0] || null; }
}
const group = (...items) => { const g = new Element(); items.forEach(n => g.appendChild(n)); return g; };
let now = 0, id = 0, frames = new Map(), change;
globalThis.matchMedia = () => ({ matches: false, addEventListener: (_, fn) => { change = fn; } });
globalThis.getComputedStyle = el => ({ ...el.style, opacity: el.style.opacity || '1', getPropertyValue: () => '' });
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
globalThis.cancelAnimationFrame = i => frames.delete(i);
function tick(ms) { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); }
const M = await import('./motion.js');
test.afterEach(() => { M.finishAll(); change({ matches: false }); assert.equal(frames.size, 0); });

const formats = [
  ['67%', '59%'], ['52.34', '45.80'], ['2.04M TOE', '1.79M TOE'], ['540,000', '472,500'],
  ['357.1 MW', '312.5 MW'], ['US$1.46 billion', 'US$1.28 billion'], ['1.75%', '1.53%'],
  ['$268', '$235'], ['₩65,000', '₩56,875'], ['10 million', '9 million'],
  ['−50%', '−44%'], ['+80 t', '+70 t'], ['457 t/day', '400 t/day'], ['+11 km/h', '+10 km/h'],
  ['−24%', '−21%'], ['121 units', '106 units'],
];
for (const [final, halfway] of formats) test(`exact format: ${final}`, async () => {
  const n = new Element(final, 'count'), original = n.childNodes[0];
  const p = M.revealBeat(group(n));
  assert.equal(n.children[0].textContent, final, 'final width reserve');
  assert.equal(n.children[0].style.opacity, '0');
  assert.equal(n.children[1].attrs['aria-hidden'], 'true');
  tick(450);
  assert.equal(n.children[1].textContent, halfway);
  tick(450); await p;
  assert.equal(n.textContent, final);
  assert.equal(n.childNodes[0], original, 'original DOM restored');
  assert.equal(n.children.length, 0);
});
for (const text of ['1900', '2026', '2100', '9 to 31%', '75 to 80%', '2001 to 2023']) test(`skip: ${text}`, () => {
  const n = new Element(text, 'count'); M.revealBeat(group(n));
  assert.equal(n.children.length, 0); assert.equal(n.textContent, text);
});
test('instant paths schedule no frames, including counts and draws', async () => {
  const n = new Element('₩65,000', 'count'), d = new Element('', 'draw'), g = group(n, d);
  M.hideBeat(g, { instant: true });
  await M.enterSlide(g, { instant: true }); await M.revealBeat(g, { instant: true });
  assert.equal(frames.size, 0); assert.equal(n.textContent, '₩65,000'); assert.equal(d.style.transform, '');
  await M.leaveSlide(g, { instant: true }); assert.equal(g.style.opacity, '0');
});
test('reduced motion on import and live preference changes', async () => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  const reduced = await import('./motion.js?reduced');
  globalThis.matchMedia = previous;
  assert.equal(reduced.reducedMotion, true);
  await reduced.revealBeat(group(new Element('67%', 'count')));
  assert.equal(frames.size, 0);
  const n = new Element('67%', 'count'); const p = M.revealBeat(group(n));
  change({ matches: true }); await p;
  assert.equal(M.reducedMotion, true); assert.equal(n.textContent, '67%');
  const photo = new Element('', 'photo'), panel = group(photo); panel.caption = new Element();
  M.startPhoto(panel); assert.equal(photo.style.transform, 'scale(1.04)'); assert.equal(frames.size, 0);
});
test('70 ms stagger, 16 px rise, cubic easing, 450 ms arrival', async () => {
  const a = new Element(), b = new Element(); const p = M.revealBeat(group(a, b));
  assert.equal(a.style.transform, 'translateY(16px)'); tick(70);
  assert.equal(b.style.opacity, '0'); tick(225);
  assert.equal(b.style.opacity, '0.875'); assert.equal(b.style.transform, 'translateY(2px)');
  tick(225); await p; assert.equal(b.style.transform, '');
});
test('draw axis, origin, 700 ms duration, preserved rotation', async () => {
  const h = new Element('', 'draw'), v = new Element('', 'draw');
  v.box = { width: 10, height: 200 }; h.style.transform = 'rotate(10deg)';
  const p = M.revealBeat(group(h, v)); tick(350);
  assert.match(h.style.transform, /rotate\(10deg\).*scaleX\(0.875\)/);
  assert.equal(h.style.transformOrigin, 'left center'); assert.equal(v.style.transformOrigin, 'center bottom');
  tick(420); await p; assert.equal(h.style.transform, 'rotate(10deg)'); assert.equal(v.style.transform, '');
});
test('interrupt, idempotence, finishAll, hide and replay', async () => {
  const n = new Element('540,000', 'count'), g = group(n);
  const first = M.revealBeat(g); tick(100);
  const second = M.revealBeat(group(new Element('67%', 'count')));
  await first; assert.equal(n.textContent, '540,000'); M.finishAll(); await second;
  await M.revealBeat(g); assert.equal(frames.size, 0);
  M.hideBeat(g); assert.equal(g.style.opacity, '0'); assert.equal(g.attrs['aria-hidden'], 'true');
  const replay = M.revealBeat(g); assert.equal(n.children[1].textContent, '0');
  M.finishAll(); await replay; assert.equal(n.textContent, '540,000');
  for (let i = 0; i < 38; i++) { M.hideBeat(g); M.revealBeat(g); M.finishAll(); }
  assert.equal(n.children.length, 0); assert.equal(frames.size, 0);
});
test('paired slide fades run concurrently for 220 ms', async () => {
  const a = new Element(), b = new Element();
  const leave = M.leaveSlide(a), enter = M.enterSlide(b); tick(110);
  assert.equal(a.style.opacity, '0.875'); assert.equal(b.style.opacity, '0.875');
  tick(110); await Promise.all([leave, enter]); assert.equal(a.style.opacity, '0'); assert.equal(b.style.opacity, '1');
});
test('photo push, caption delay, restart, stop and finishAll', () => {
  const photo = new Element('', 'photo'), panel = group(photo), caption = new Element(); panel.caption = caption;
  const stop = M.startPhoto(panel); tick(399); assert.equal(caption.style.opacity, '0');
  tick(226); assert.equal(caption.style.opacity, '0.875'); tick(4375);
  assert.equal(photo.style.transform, 'scale(1.02)');
  stop(); stop(); assert.equal(photo.style.transform, 'scale(1.04)'); assert.equal(frames.size, 0);
  M.startPhoto(panel); M.startPhoto(panel); assert.equal(frames.size, 1);
  M.finishAll(); assert.equal(caption.style.opacity, '1'); assert.equal(frames.size, 0);
});
