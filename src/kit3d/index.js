// kit3d — shared toolkit for the deck's 3D diagrams (white architectural study model).
// Diagram modules import from here; see src/diagrams/s10-edc.js for the reference implementation.
import * as THREE from 'three';
import { createStage } from './stage.js';
import { MOTION } from './tokens.js';
import { ease } from './tween.js';

export { THREE, createStage };
export { C, LW, FONT, MOTION } from './tokens.js';
export { ease, clamp01, lerp, sub } from './tween.js';
export { InkLineMaterial, InkLines, extractEdges, edgeLinesFromGeometry, inkSegments, polylineSegments, sharedLineUniforms } from './lines.js';
export * from './geom.js';
export { ensureMontserrat, montserratReady } from './font.js';

// Registers an animator prop that fades a label in/out (with a small 8 px slide on arrival).
export function labelProp(stage, name, label, o = {}) {
  return stage.anim.prop(name, 0, v => label.setOpacity(v, (1 - v) * (o.slide ?? -8)),
    { kind: 'fade', dur: o.dur ?? 520, delay: o.delay ?? 0 });
}

// Fades a whole part (meshes + ink lines). Meshes get their own material on first use so shared
// materials are not affected. Fully transparent parts are hidden (and drop out of the audit).
export function setOpacity(obj, v) {
  obj.traverse(o => {
    if (o.isInkLines) o.material.setOpacity(v);
    else if (o.isMesh && o.material && !o.material.isShadowMaterial) {
      if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
      const m = o.material;
      const t = v < 0.999;
      if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
      m.opacity = v;
      m.depthWrite = v > 0.6;
      o.castShadow = o.userData.castShadow0 ?? (o.userData.castShadow0 = o.castShadow, o.castShadow);
      if (v < 0.5) o.castShadow = false;
    }
  });
  obj.visible = v > 0.002;
}

// Wraps the module contract (ARCHITECTURE.md §5) around a build function.
// build(stage, ctx) must register animator props and return { targets(n) => {prop: value}, plan?(name, from, to, dir, n) }.
export function defineDiagram({ id, states, region, stage: stageOpts = {}, build }) {
  return {
    id, states, region,
    create(ctx) {
      const stage = createStage(ctx, Object.assign({ region }, stageOpts));
      const api = build(stage, ctx) || {};
      let cur = 0;
      const clampN = n => Math.max(0, Math.min(states, Math.round(n || 0)));
      const inst = {
        stage,
        get state() { return cur; },
        setState(n, { instant = false } = {}) {
          n = clampN(n);
          const dir = n >= cur ? 1 : -1;
          const from = cur;
          cur = n;
          const p = stage.anim.to(api.targets(n), {
            instant: instant || !!ctx.reducedMotion,
            dir,
            plan: api.plan ? (name, f, t, d) => api.plan(name, f, t, d, n, from) : null,
          });
          if (instant || ctx.reducedMotion) stage.renderNow();
          return p;
        },
        resize(w, h) { stage.resize(w, h); },
        renderOnce() { stage.renderNow(); },
        audit() { return stage.audit(); },
        dispose() { stage.dispose(); },
      };
      inst.setState(0, { instant: true });
      return inst;
    },
  };
}

// Stagger helper for plans: index i of a sibling group.
export const stagger = (i, step = MOTION.stagger) => i * step;
export const EASE = ease;
