// No timers, CSS animations, dependencies, or retained references to idle slides.
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export let reducedMotion = !!media?.matches;
const running = new Set();
const bases = new WeakMap();
const revealed = new WeakSet();
const photos = new WeakMap();
const out = p => 1 - (1 - p) ** 3;
const clamp = p => Math.max(0, Math.min(1, p));
const css = el => typeof getComputedStyle === 'function' ? getComputedStyle(el) : el.style;

function base(el) {
  if (!bases.has(el)) {
    const s = css(el);
    const declared = s.getPropertyValue?.('--o');
    bases.set(el, { transform: el.style.transform || (s.transform === 'none' ? '' : s.transform) || '',
      opacity: declared?.trim() ? Number(declared) : Number(s.opacity || 1) });
    el.style.transition = 'none'; // This module owns motion, including instant paths.
  }
  return bases.get(el);
}
function transform(el, extra = '') {
  el.style.transform = [base(el).transform, extra].filter(Boolean).join(' ');
}
function animate(duration, update, complete = () => {}, instant = false, kind = 'beat') {
  let frame = null, done = false;
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  const job = { kind, finish() {
    if (done) return;
    done = true;
    if (frame !== null) cancelAnimationFrame(frame);
    running.delete(job);
    update(duration);
    complete();
    resolve();
  } };
  if (instant || reducedMotion || duration <= 0) job.finish();
  else {
    const start = performance.now();
    running.add(job);
    update(0);
    const tick = now => {
      if (done) return;
      if (now - start >= duration) job.finish();
      else { update(Math.max(0, now - start)); frame = requestAnimationFrame(tick); }
    };
    frame = requestAnimationFrame(tick);
  }
  return { promise, finish: job.finish };
}
export function finishAll() { for (const job of [...running]) job.finish(); }
media?.addEventListener?.('change', event => {
  reducedMotion = event.matches;
  if (reducedMotion) finishAll();
});

export function enterSlide(sectionEl, { instant = false } = {}) {
  // Preserve a just-started outgoing fade, so leaveSlide + enterSlide crossfade.
  for (const job of [...running]) if (job.kind !== 'leave') job.finish();
  const b = base(sectionEl);
  return animate(220, t => { sectionEl.style.opacity = String(b.opacity * out(clamp(t / 220))); },
    () => {}, instant, 'enter').promise;
}
export function leaveSlide(sectionEl, { instant = false } = {}) {
  finishAll();
  const b = base(sectionEl);
  return animate(220, t => { sectionEl.style.opacity = String(b.opacity * (1 - clamp(t / 220) ** 3)); },
    () => {}, instant, 'leave').promise;
}

// A single numeric token only: never reinterpret a range, date, or prose with several numbers.
function numberFormat(text) {
  if (/\bto\b/i.test(text)) return null;
  const matches = [...text.matchAll(/[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)];
  if (matches.length !== 1) return null;
  const m = matches[0], token = m[0];
  const sign = /^[+\-−]/.test(token) ? token[0] : '';
  const magnitude = token.replace(/^[+\-−]/, '');
  const value = Number(magnitude.replaceAll(',', ''));
  if (!Number.isFinite(value) || (value >= 1900 && value <= 2100 && !magnitude.includes('.'))) return null;
  const decimals = (magnitude.split('.')[1] || '').length;
  if (decimals > 20) return null;
  return progress => {
    if (progress >= 1) return text;
    let [whole, fraction] = (value * out(progress)).toFixed(decimals).split('.');
    if (magnitude.includes(',')) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return text.slice(0, m.index) + sign + whole + (fraction === undefined ? '' : '.' + fraction) + text.slice(m.index + token.length);
  };
}
function counter(el) {
  const format = numberFormat(el.textContent);
  // Rich text (e.g. CO2 SVG glyphs) remains untouched unless caller isolates a numeric span.
  if (!format || el.children.length) return null;
  const original = [...el.childNodes];
  const reserve = el.ownerDocument.createElement('span');
  const overlay = el.ownerDocument.createElement('span');
  const position = el.style.position, display = el.style.display;
  if (css(el).position === 'static' || !css(el).position) el.style.position = 'relative';
  if (css(el).display === 'inline' || !css(el).display) el.style.display = 'inline-block';
  reserve.style.opacity = '0';
  original.forEach(node => reserve.appendChild(node));
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'absolute', inset: '0', whiteSpace: 'inherit' });
  el.appendChild(reserve); el.appendChild(overlay);
  return { update(p) { overlay.textContent = format(p); }, finish() {
    el.replaceChildren(...original);
    el.style.position = position;
    el.style.display = display;
  } };
}
function marked(root) {
  return [...(root.matches('[data-motion]') ? [root] : []), ...root.querySelectorAll('[data-motion]')];
}
function children(group) { return [...group.children]; }

export function revealBeat(groupEl, { instant = false } = {}) {
  finishAll();
  if (revealed.has(groupEl)) return Promise.resolve();
  revealed.add(groupEl);
  groupEl.style.opacity = '1';
  groupEl.setAttribute('aria-hidden', 'false');
  const items = children(groupEl);
  const tasks = [];
  for (const [index, el] of items.entries()) {
    const b = base(el), delay = index * 70;
    const specials = marked(el).map(node => {
      base(node);
      if (node.dataset.motion === 'count' && !instant && !reducedMotion) {
        const c = counter(node);
        if (c) tasks.push(c);
        return { node, c, duration: c ? 900 : 0 };
      }
      if (node.dataset.motion === 'draw') {
        const box = node.getBoundingClientRect();
        const vertical = box.height > box.width;
        node.style.transformOrigin = vertical ? 'center bottom' : 'left center';
        return { node, axis: vertical ? 'Y' : 'X', duration: 700 };
      }
      return { node, duration: 0 };
    });
    tasks.push({ el, b, delay, specials });
  }
  const rows = tasks.filter(t => t.el);
  const duration = Math.max(0, ...rows.map(r => r.delay + Math.max(450, ...r.specials.map(s => s.duration))));
  return animate(duration, time => {
    for (const r of rows) {
      const p = out(clamp((time - r.delay) / 450));
      r.el.style.opacity = String(r.b.opacity * p);
      transform(r.el, p < 1 ? `translateY(${16 * (1 - p)}px)` : '');
      for (const s of r.specials) {
        const q = clamp((time - r.delay) / s.duration);
        s.c?.update(q);
        if (s.axis) {
          const rise = s.node === r.el && p < 1 ? `translateY(${16 * (1 - p)}px) ` : '';
          transform(s.node, rise + (q < 1 ? `scale${s.axis}(${out(q)})` : ''));
        }
      }
    }
  }, () => { for (const task of tasks) task.finish?.(); }, instant).promise;
}

export function hideBeat(groupEl, { instant = false } = {}) {
  // Back navigation is always immediate; instant is accepted for API symmetry.
  finishAll();
  revealed.delete(groupEl);
  groupEl.style.opacity = '0';
  groupEl.setAttribute('aria-hidden', 'true');
  for (const el of children(groupEl)) {
    base(el);
    el.style.opacity = '0';
    transform(el, instant || reducedMotion ? '' : 'translateY(16px)');
  }
}

export function startPhoto(panelEl, { durationMs = 10000 } = {}) {
  photos.get(panelEl)?.();
  const photo = panelEl.matches('[data-motion="photo"]') ? panelEl : panelEl.querySelector('[data-motion="photo"]');
  const caption = panelEl.querySelector('[data-motion-caption], .img-cap, figcaption');
  if (!photo) return () => {};
  base(photo);
  if (caption) base(caption);
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 10000;
  const job = animate(Math.max(duration, 850), time => {
    const p = duration === 0 ? 1 : clamp(time / duration);
    // Smooth internal movement, ease-in-out, no bounce.
    transform(photo, `scale(${1 + 0.04 * (p * p * (3 - 2 * p))})`);
    if (caption) caption.style.opacity = String(base(caption).opacity * out(clamp((time - 400) / 450)));
  }, () => photos.delete(panelEl), duration === 0, 'photo');
  photos.set(panelEl, job.finish);
  return job.finish;
}
