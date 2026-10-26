// Mounts 3D diagram modules (ARCHITECTURE.md section 5) into their slots and keeps their state.
// createDiagramHost({ registry, view, getScale, reducedMotion })
//   -> { has(id), isLive(id), mount(slot, id), unmount(id), setState(id, n, opts), stateOf(id), renderOnce(id),
//        audit(id), instance(id), refreshPixelRatio(), disposeAll() }
// A module that is missing, or whose create() throws, is never live: the slide keeps its Figma 2D fallback.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createDiagramHost({ registry = {}, view = 'audience', getScale = () => 1, reducedMotion = false, onLiveChange = null } = {}) {
  const quality = view === 'presenter' ? 'preview' : 'high';
  const live = new Map(); // id -> { inst, slot, state, pr, failed }
  const failed = new Set();

  function pixelRatio() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const s = view === 'print' ? 1 : (getScale() || 1);
    if (view === 'print') return 2; // PDF snapshots: 2x so diagrams stay crisp when the PDF is zoomed
    if (quality === 'preview') return clamp(dpr * s, 0.35, 1);
    return clamp(dpr * s, 0.5, 2.5);
  }

  const has = (id) => !!registry[id] && !failed.has(id);

  function mount(slot, id) {
    if (live.has(id)) return live.get(id).inst;
    const mod = registry[id];
    if (!mod || failed.has(id)) return null;
    const pr = pixelRatio();
    try {
      slot.textContent = '';
      const inst = mod.create({ container: slot, pixelRatio: pr, quality, reducedMotion: !!reducedMotion });
      if (!inst || typeof inst.setState !== 'function') throw new Error('create() did not return an instance');
      live.set(id, { inst, slot, state: 0, pr });
      slot.classList.add('is-live');
      if (onLiveChange) onLiveChange(id, true);
      return inst;
    } catch (e) {
      console.error(`[diagram ${id}] create failed, keeping the 2D fallback:`, e);
      failed.add(id);
      slot.textContent = '';
      slot.classList.remove('is-live');
      if (onLiveChange) onLiveChange(id, false);
      return null;
    }
  }

  function unmount(id) {
    const rec = live.get(id);
    if (!rec) return;
    live.delete(id);
    try { rec.inst.dispose(); } catch (e) { console.error(`[diagram ${id}] dispose failed:`, e); }
    rec.slot.textContent = '';
    rec.slot.classList.remove('is-live');
    if (onLiveChange) onLiveChange(id, false);
  }

  function setState(id, n, opts = {}) {
    const rec = live.get(id);
    if (!rec) return Promise.resolve();
    const instant = !!opts.instant || !!reducedMotion;
    if (rec.state === n && !opts.force) return Promise.resolve();
    rec.state = n;
    try {
      const p = rec.inst.setState(n, { instant });
      return Promise.resolve(p).catch((e) => console.error(`[diagram ${id}] setState(${n}) failed:`, e));
    } catch (e) {
      console.error(`[diagram ${id}] setState(${n}) failed:`, e);
      return Promise.resolve();
    }
  }

  function renderOnce(id) {
    const rec = live.get(id);
    if (!rec) return;
    try { rec.inst.renderOnce(); } catch (e) { console.error(`[diagram ${id}] renderOnce failed:`, e); }
  }

  function audit(id) {
    const rec = live.get(id);
    if (!rec || typeof rec.inst.audit !== 'function') return null;
    try { return rec.inst.audit(); } catch (e) { return { labels: [], violations: [`audit() threw: ${e && e.message}`] }; }
  }

  // The stage scale changed (window resize, fullscreen): rebuild live instances whose pixel ratio is now off by
  // more than 20 %, restoring their state instantly. Contract ctx.pixelRatio is fixed per instance.
  function refreshPixelRatio() {
    const pr = pixelRatio();
    for (const [id, rec] of [...live]) {
      if (Math.abs(pr - rec.pr) / rec.pr < 0.2) continue;
      const { slot, state } = rec;
      unmount(id);
      const inst = mount(slot, id);
      if (inst) setState(id, state, { instant: true, force: true });
    }
  }

  function disposeAll() { for (const id of [...live.keys()]) unmount(id); }

  return {
    quality,
    has,
    isLive: (id) => live.has(id),
    mount,
    unmount,
    setState,
    stateOf: (id) => (live.has(id) ? live.get(id).state : null),
    renderOnce,
    audit,
    instance: (id) => (live.has(id) ? live.get(id).inst : null),
    liveIds: () => [...live.keys()],
    refreshPixelRatio,
    disposeAll,
  };
}
