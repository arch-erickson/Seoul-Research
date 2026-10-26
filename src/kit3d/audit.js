// Mechanical no-overlap audit (ARCHITECTURE.md §1, §8), measured in screen space:
//  - label vs label bounding boxes
//  - label leaving the region
//  - label vs geometry: the scene is rendered once more into an offscreen ID buffer at 1 design px
//    per pixel (every part a flat unique colour, shadows/ground excluded); any foreign pixel under a
//    label box is a violation unless that part is in the label's `allow` list.
//  - leaders: crossing another label, another leader, or geometry other than the label's own anchor part.
import * as THREE from 'three';
import { sharedLineUniforms } from './lines.js';

function partIdOf(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.partId) return o.userData.partId;
    o = o.parent;
  }
  return 0;
}

function isIgnored(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.auditIgnore) return true;
    o = o.parent;
  }
  return false;
}

export function renderIdBuffer(stage) {
  const { renderer, scene, camera } = stage;
  const W = stage.W, H = stage.H;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, samples: 0 });
  const swaps = [];
  const basic = new Map();
  scene.traverse(obj => {
    if (!obj.visible) return;
    if (obj.isLight || obj.isCamera) return;
    if (!(obj.isMesh || obj.isLine || obj.isPoints)) return;
    const hidden = isIgnored(obj) || (obj.material && obj.material.userData && obj.material.userData.auditIgnore);
    const id = hidden ? 0 : partIdOf(obj);
    if (obj.material && obj.material.isInkLineMaterial) {
      const u = obj.material.uniforms;
      swaps.push({ obj, kind: 'ink', idMode: u.uIdMode.value, idColor: u.uIdColor.value.clone(), visible: obj.visible, opacity: u.opacity.value, transparent: obj.material.transparent, blending: obj.material.blending });
      if (hidden || id === 0 || u.opacity.value < 0.02) { obj.visible = false; return; }
      u.uIdMode.value = 1;
      u.uIdColor.value.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.LinearSRGBColorSpace);
      obj.material.transparent = false;
      obj.material.blending = THREE.NoBlending;
      return;
    }
    swaps.push({ obj, kind: 'mat', material: obj.material, visible: obj.visible });
    const op = Array.isArray(obj.material) ? 1 : (obj.material.opacity ?? 1);
    if (hidden || id === 0 || op < 0.02 || (obj.material && obj.material.isShadowMaterial)) { obj.visible = false; return; }
    const side = Array.isArray(obj.material) ? THREE.FrontSide : obj.material.side;
    const clip = Array.isArray(obj.material) ? null : obj.material.clippingPlanes;
    const key = id + '_' + side + '_' + (clip ? obj.material.uuid : '');
    let m = basic.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ side, toneMapped: false });
      m.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.LinearSRGBColorSpace);
      m.blending = THREE.NoBlending;
      if (clip) m.clippingPlanes = clip;
      basic.set(key, m);
    }
    obj.material = m;
  });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  const prevPx = sharedLineUniforms.uPxScale.value, prevMin = sharedLineUniforms.uMinPx.value;
  sharedLineUniforms.uPxScale.value = 1;
  sharedLineUniforms.uMinPx.value = 1;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  sharedLineUniforms.uPxScale.value = prevPx;
  sharedLineUniforms.uMinPx.value = prevMin;
  for (const s of swaps) {
    s.obj.visible = s.visible;
    if (s.kind === 'ink') {
      const u = s.obj.material.uniforms;
      u.uIdMode.value = s.idMode;
      u.uIdColor.value.copy(s.idColor);
      s.obj.material.transparent = s.transparent;
      s.obj.material.blending = s.blending;
    } else s.obj.material = s.material;
  }
  for (const m of basic.values()) m.dispose();
  rt.dispose();
  // id grid, top-left origin
  const ids = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = H - 1 - y;
    for (let x = 0; x < W; x++) {
      const i = (sy * W + x) * 4;
      if (buf[i + 3] === 0) continue;
      ids[y * W + x] = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
    }
  }
  stage.renderNow();
  return { ids, W, H };
}

function rectsOverlap(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

function segIntersectsRect(p, q, r) {
  // Liang–Barsky clip
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const checks = [[-dx, p[0] - r.x], [dx, r.x + r.w - p[0]], [-dy, p[1] - r.y], [dy, r.y + r.h - p[1]]];
  for (const [pp, qq] of checks) {
    if (pp === 0) { if (qq < 0) return false; }
    else {
      const t = qq / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return t0 <= t1;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function idsOf(objs) {
  const s = new Set();
  for (const o of objs || []) {
    if (!o) continue;
    if (typeof o === 'number') { s.add(o); continue; }
    o.traverse(c => { if (c.userData && c.userData.partId) s.add(c.userData.partId); });
    const p = partIdOf(o);
    if (p) s.add(p);
  }
  return s;
}

export function runAudit(stage, { minGap = 0 } = {}) {
  stage.renderNow();
  const W = stage.W, H = stage.H;
  const labels = stage.labels.labels.filter(l => l.visible);
  const out = { labels: [], violations: [] };
  for (const l of labels) {
    l.measure();
    l.update();
    out.labels.push({ text: l.o.text + (l.o.sub ? ' / ' + l.o.sub : ''), rect: { ...l.box } });
  }
  // 1. label vs label
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    if (rectsOverlap(labels[i].box, labels[j].box, minGap)) out.violations.push(`label-label: "${labels[i].o.text}" × "${labels[j].o.text}"`);
  }
  // 2. outside region
  for (const l of labels) {
    const b = l.box;
    if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) out.violations.push(`label-outside: "${l.o.text}" rect ${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)}x${Math.round(b.h)} region ${W}x${H}`);
    if (l.leaderPts) for (const [x, y] of l.leaderPts) if (x < 0 || y < 0 || x > W || y > H) { out.violations.push(`leader-outside: "${l.o.text}"`); break; }
  }
  // 3. geometry under labels / leaders
  const { ids } = renderIdBuffer(stage);
  const names = stage.partNames;
  for (const l of labels) {
    const allow = idsOf(l.o.allow);
    const b = l.box;
    const hits = new Map();
    const x0 = Math.max(0, Math.floor(b.x)), x1 = Math.min(W, Math.ceil(b.x + b.w));
    const y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(H, Math.ceil(b.y + b.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const id = ids[y * W + x];
      if (id && !allow.has(id)) hits.set(id, (hits.get(id) || 0) + 1);
    }
    for (const [id, n] of hits) out.violations.push(`label-geometry: "${l.o.text}" over "${names.get(id) || id}" (${n} px)`);
    if (l.leaderPts) {
      const own = idsOf([l.o.anchorObj, ...(l.o.allow || [])]);
      const lhits = new Map();
      for (let s = 0; s < l.leaderPts.length - 1; s++) {
        const p = l.leaderPts[s], q = l.leaderPts[s + 1];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const n = Math.ceil(len);
        for (let k = 0; k <= n; k++) {
          const t = n ? k / n : 0;
          const x = Math.round(p[0] + (q[0] - p[0]) * t - 0.5), y = Math.round(p[1] + (q[1] - p[1]) * t - 0.5);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          // the dot itself sits on the anchor part; skip its radius
          if (s === 0 && Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1]) < 4) continue;
          const id = ids[y * W + x];
          if (id && !own.has(id)) lhits.set(id, (lhits.get(id) || 0) + 1);
        }
      }
      for (const [id, n] of lhits) out.violations.push(`leader-geometry: "${l.o.text}" leader crosses "${names.get(id) || id}" (${n} px)`);
    }
  }
  // 4. leaders vs other labels and other leaders
  for (const a of labels) {
    if (!a.leaderPts) continue;
    for (const b of labels) {
      if (a === b) continue;
      for (let s = 0; s < a.leaderPts.length - 1; s++) {
        if (segIntersectsRect(a.leaderPts[s], a.leaderPts[s + 1], b.box)) { out.violations.push(`leader-label: leader of "${a.o.text}" crosses label "${b.o.text}"`); break; }
      }
      if (b.leaderPts && a !== b && labels.indexOf(b) > labels.indexOf(a)) {
        let crossed = false;
        for (let s = 0; s < a.leaderPts.length - 1 && !crossed; s++) for (let t = 0; t < b.leaderPts.length - 1 && !crossed; t++) {
          if (segsCross(a.leaderPts[s], a.leaderPts[s + 1], b.leaderPts[t], b.leaderPts[t + 1])) crossed = true;
        }
        if (crossed) out.violations.push(`leader-leader: "${a.o.text}" × "${b.o.text}"`);
      }
    }
  }
  return out;
}
