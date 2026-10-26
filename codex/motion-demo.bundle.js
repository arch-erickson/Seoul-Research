var Motion = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/engine/motion.js
  var motion_exports = {};
  __export(motion_exports, {
    enterSlide: () => enterSlide,
    finishAll: () => finishAll,
    hideBeat: () => hideBeat,
    leaveSlide: () => leaveSlide,
    reducedMotion: () => reducedMotion,
    revealBeat: () => revealBeat,
    startPhoto: () => startPhoto
  });
  var media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reducedMotion = !!media?.matches;
  var running = /* @__PURE__ */ new Set();
  var bases = /* @__PURE__ */ new WeakMap();
  var revealed = /* @__PURE__ */ new WeakSet();
  var photos = /* @__PURE__ */ new WeakMap();
  var out = (p) => 1 - (1 - p) ** 3;
  var clamp = (p) => Math.max(0, Math.min(1, p));
  var css = (el) => typeof getComputedStyle === "function" ? getComputedStyle(el) : el.style;
  var SLIDE_MS = 440;
  var ARRIVAL_MS = 900;
  var STAGGER_MS = 140;
  var DRAW_MS = 1400;
  var CAPTION_DELAY_MS = 800;
  var CAPTION_MS = 900;
  function countDuration(value, suffix) {
    const multiplier = /^\s*(?:billion\b|B\b)/i.test(suffix) ? 1e9 : /^\s*(?:million\b|M\b)/i.test(suffix) ? 1e6 : /^\s*(?:thousand\b|K\b)/i.test(suffix) ? 1e3 : 1;
    const magnitude = value * multiplier;
    if (magnitude >= 1e9) return 8e3;
    if (magnitude >= 1e8) return 7e3;
    if (magnitude >= 1e7) return 6e3;
    if (magnitude >= 1e6) return 5e3;
    if (magnitude >= 1e5) return 4e3;
    if (magnitude >= 1e4) return 3e3;
    if (magnitude >= 1e3) return 2400;
    return 1800;
  }
  function base(el) {
    if (!bases.has(el)) {
      const s = css(el);
      const declared = s.getPropertyValue?.("--o");
      bases.set(el, {
        transform: el.style.transform || (s.transform === "none" ? "" : s.transform) || "",
        opacity: declared?.trim() ? Number(declared) : Number(s.opacity || 1)
      });
      el.style.transition = "none";
    }
    return bases.get(el);
  }
  function transform(el, extra = "") {
    el.style.transform = [base(el).transform, extra].filter(Boolean).join(" ");
  }
  function animate(duration, update, complete = () => {
  }, instant = false, kind = "beat") {
    let frame = null, done = false;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
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
      const tick = (now) => {
        if (done) return;
        if (now - start >= duration) job.finish();
        else {
          update(Math.max(0, now - start));
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    }
    return { promise, finish: job.finish };
  }
  function finishAll() {
    for (const job of [...running]) job.finish();
  }
  media?.addEventListener?.("change", (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) finishAll();
  });
  function enterSlide(sectionEl, { instant = false } = {}) {
    for (const job of [...running]) if (job.kind !== "leave") job.finish();
    const b = base(sectionEl);
    return animate(
      SLIDE_MS,
      (t) => {
        sectionEl.style.opacity = String(b.opacity * out(clamp(t / SLIDE_MS)));
      },
      () => {
      },
      instant,
      "enter"
    ).promise;
  }
  function leaveSlide(sectionEl, { instant = false } = {}) {
    finishAll();
    const b = base(sectionEl);
    return animate(
      SLIDE_MS,
      (t) => {
        sectionEl.style.opacity = String(b.opacity * (1 - clamp(t / SLIDE_MS) ** 3));
      },
      () => {
      },
      instant,
      "leave"
    ).promise;
  }
  function numberFormat(text) {
    if (/\bto\b/i.test(text)) return null;
    const matches = [...text.matchAll(/[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)];
    if (matches.length !== 1) return null;
    const m = matches[0], token = m[0];
    const sign = /^[+\-−]/.test(token) ? token[0] : "";
    const magnitude = token.replace(/^[+\-−]/, "");
    const value = Number(magnitude.replaceAll(",", ""));
    if (!Number.isFinite(value) || value >= 1900 && value <= 2100 && !magnitude.includes(".")) return null;
    const decimals = (magnitude.split(".")[1] || "").length;
    if (decimals > 20) return null;
    const suffix = text.slice(m.index + token.length);
    const format = (progress) => {
      if (progress >= 1) return text;
      const quantum = 10 ** -decimals;
      const current = Math.min(value * out(progress), Math.max(0, value - quantum));
      let [whole, fraction] = current.toFixed(decimals).split(".");
      if (magnitude.includes(",")) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return text.slice(0, m.index) + sign + whole + (fraction === void 0 ? "" : "." + fraction) + text.slice(m.index + token.length);
    };
    return { format, duration: countDuration(value, suffix) };
  }
  function counter(el) {
    const parsed = numberFormat(el.textContent);
    if (!parsed || el.children.length) return null;
    const original = [...el.childNodes];
    const reserve = el.ownerDocument.createElement("span");
    const overlay = el.ownerDocument.createElement("span");
    const position = el.style.position, display = el.style.display;
    if (css(el).position === "static" || !css(el).position) el.style.position = "relative";
    if (css(el).display === "inline" || !css(el).display) el.style.display = "inline-block";
    reserve.style.opacity = "0";
    original.forEach((node) => reserve.appendChild(node));
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, { position: "absolute", inset: "0", whiteSpace: "inherit" });
    el.appendChild(reserve);
    el.appendChild(overlay);
    return { duration: parsed.duration, update(p) {
      overlay.textContent = parsed.format(p);
    }, finish() {
      el.replaceChildren(...original);
      el.style.position = position;
      el.style.display = display;
    } };
  }
  function marked(root) {
    return [...root.matches("[data-motion]") ? [root] : [], ...root.querySelectorAll("[data-motion]")];
  }
  function children(group) {
    return [...group.children];
  }
  function revealBeat(groupEl, { instant = false } = {}) {
    finishAll();
    if (revealed.has(groupEl)) return Promise.resolve();
    revealed.add(groupEl);
    groupEl.style.opacity = "1";
    groupEl.setAttribute("aria-hidden", "false");
    const items = children(groupEl);
    const tasks = [];
    for (const [index, el] of items.entries()) {
      const b = base(el), delay = index * STAGGER_MS;
      const specials = marked(el).map((node) => {
        base(node);
        if (node.dataset.motion === "count" && !instant && !reducedMotion) {
          const c = counter(node);
          if (c) tasks.push(c);
          return { node, c, duration: c ? c.duration : 0 };
        }
        if (node.dataset.motion === "draw") {
          const box = node.getBoundingClientRect();
          const vertical = box.height > box.width;
          node.style.transformOrigin = vertical ? "center bottom" : "left center";
          return { node, axis: vertical ? "Y" : "X", duration: DRAW_MS };
        }
        return { node, duration: 0 };
      });
      tasks.push({ el, b, delay, specials });
    }
    const rows = tasks.filter((t) => t.el);
    const duration = Math.max(0, ...rows.map((r) => r.delay + Math.max(ARRIVAL_MS, ...r.specials.map((s) => s.duration))));
    return animate(duration, (time) => {
      for (const r of rows) {
        const p = out(clamp((time - r.delay) / ARRIVAL_MS));
        r.el.style.opacity = String(r.b.opacity * p);
        transform(r.el, p < 1 ? `translateY(${16 * (1 - p)}px)` : "");
        for (const s of r.specials) {
          const q = clamp((time - r.delay) / s.duration);
          s.c?.update(q);
          if (s.axis) {
            const rise = s.node === r.el && p < 1 ? `translateY(${16 * (1 - p)}px) ` : "";
            transform(s.node, rise + (q < 1 ? `scale${s.axis}(${out(q)})` : ""));
          }
        }
      }
    }, () => {
      for (const task of tasks) task.finish?.();
    }, instant).promise;
  }
  function hideBeat(groupEl, { instant = false } = {}) {
    finishAll();
    revealed.delete(groupEl);
    groupEl.style.opacity = "0";
    groupEl.setAttribute("aria-hidden", "true");
    for (const el of children(groupEl)) {
      base(el);
      el.style.opacity = "0";
      transform(el, instant || reducedMotion ? "" : "translateY(16px)");
    }
  }
  function startPhoto(panelEl, { durationMs = 2e4 } = {}) {
    photos.get(panelEl)?.();
    const photo = panelEl.matches('[data-motion="photo"]') ? panelEl : panelEl.querySelector('[data-motion="photo"]');
    const caption = panelEl.querySelector("[data-motion-caption], .img-cap, figcaption");
    if (!photo) return () => {
    };
    base(photo);
    if (caption) base(caption);
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 2e4;
    const job = animate(Math.max(duration, CAPTION_DELAY_MS + CAPTION_MS), (time) => {
      const p = duration === 0 ? 1 : clamp(time / duration);
      transform(photo, `scale(${1 + 0.04 * (p * p * (3 - 2 * p))})`);
      if (caption) caption.style.opacity = String(base(caption).opacity * out(clamp((time - CAPTION_DELAY_MS) / CAPTION_MS)));
    }, () => photos.delete(panelEl), duration === 0, "photo");
    photos.set(panelEl, job.finish);
    return job.finish;
  }
  return __toCommonJS(motion_exports);
})();
