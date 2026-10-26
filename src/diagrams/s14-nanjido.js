// s14-nanjido: Nanjido: a cut-away axonometric section of one ~90 m landfill mound.
// The mound is built as five 18 m lifts with benches between them (an engineered landfill profile). The front
// of the mound is cut away along its long axis, so the cut face shows the compacted waste as fine horizontal
// strata. The second mound stands behind as a quiet light-grey silhouette. State 2 adds the fix: a sealed cap
// and soil laid over the mound, a fine planted surface on top (Haneul Park), and red gas collection wells
// drilled down through the waste. Plan dimensions are compressed (vertical exaggeration about 1.5x).
// States: 0 empty · 1 the mound rises lift by lift · 2 cap, soil, planting, gas wells.
import {
  defineDiagram, THREE, C, LW, ease, sub, labelProp, extractEdges, InkLineMaterial, InkLines, rng,
} from '../kit3d/index.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

const DEG = Math.PI / 180;

// ---- dimensions (m) ----
const LIFT = 18, NLIFT = 5;        // five lifts of compacted waste, 90 m
const H = LIFT * NLIFT;
const RUN = 9, BENCH = 7;          // per lift: slope run and bench width
const A0 = 114, B0 = 112, R0 = 52; // base: half-length (x), half-width (z), plan corner radius
const T_CAP = 2.5;                 // outer surface of the sealed cap (offset from the waste)
const T_SOIL = 6;                  // outer surface of the soil layer
const ZC = 26;                     // the cut plane z = ZC (a little in front of the long axis)
const ARC = 10;                    // segments per plan corner
const PIPE_W = 2.2, PIPE_BOT = 8;  // gas well pipe (section) and the bottom of the wells

// Waste profile in (setback s, height y): toe → lifts and benches → shoulder.
const WASTE = [[0, 0]];
for (let i = 0; i < NLIFT; i++) {
  const s0 = i * (RUN + BENCH);
  WASTE.push([s0 + RUN, (i + 1) * LIFT]);
  if (i < NLIFT - 1) WASTE.push([s0 + RUN + BENCH, (i + 1) * LIFT]);
}
const S_TOP = WASTE[WASTE.length - 1][0];

// Outer surface offset by t (mitred polyline offset; the base stays on the ground, the top is flat).
function offsetProfile(t) {
  if (t === 0) return WASTE.map(p => p.slice());
  const P = [...WASTE, [S_TOP + 500, H]];
  const lines = [];
  for (let i = 0; i < P.length - 1; i++) {
    const [s0, y0] = P[i], [s1, y1] = P[i + 1];
    const L = Math.hypot(s1 - s0, y1 - y0);
    const n = [-(y1 - y0) / L, (s1 - s0) / L];          // outward: toward smaller s, larger y
    lines.push({ p: [s0 + n[0] * t, y0 + n[1] * t], d: [(s1 - s0) / L, (y1 - y0) / L] });
  }
  const meet = (a, b) => {
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    const u = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
    return [a.p[0] + a.d[0] * u, a.p[1] + a.d[1] * u];
  };
  const out = [];
  const l0 = lines[0];
  out.push([l0.p[0] - l0.d[0] * (l0.p[1] / l0.d[1]), 0]);   // toe on the ground
  for (let i = 0; i < lines.length - 1; i++) out.push(meet(lines[i], lines[i + 1]));
  return out;
}
const PROF = { 0: offsetProfile(0), [T_CAP]: offsetProfile(T_CAP), [T_SOIL]: offsetProfile(T_SOIL) };
const topOf = t => H + t;
// setback of surface t at height y (on a bench height: the outer rim)
function setbackAt(t, y) {
  const P = PROF[t];
  for (let i = 0; i < P.length - 1; i++) {
    const [s0, y0] = P[i], [s1, y1] = P[i + 1];
    if (y1 > y0 && y >= y0 - 1e-9 && y <= y1 + 1e-9) return s0 + (s1 - s0) * (y - y0) / (y1 - y0);
  }
  return P[P.length - 1][0];
}
const halfLen = (t, y) => A0 - setbackAt(t, y);
// soil surface height above x in the section plane (benches and plateau)
function soilY(x) {
  const s = A0 - Math.abs(x);
  const P = PROF[T_SOIL];
  for (let i = 0; i < P.length - 1; i++) {
    const [s0, y0] = P[i], [s1, y1] = P[i + 1];
    if (s >= s0 && s <= s1 && s1 > s0) return y0 + (y1 - y0) * (s - s0) / (s1 - s0);
  }
  return topOf(T_SOIL);
}

// Rounded-rectangle outline in plan, offset inward by s. half: the part behind the cut (z <= ZC) as an open
// chain from (+A, ZC) round the back to (-A, ZC); else the closed outline.
function outline(s, { half = true, k = 1, ox = 0, oz = 0 } = {}) {
  const A = (A0 - s) * k, B = (B0 - s) * k, R = Math.max(4, (R0 - s) * k);
  const corners = [[A - R, -(B - R), 0], [-(A - R), -(B - R), -90], [-(A - R), B - R, -180], [A - R, B - R, -270]];
  const pts = [];
  for (const [cx, cz, a0] of (half ? corners.slice(0, 2) : corners)) {
    for (let i = 0; i <= ARC; i++) {
      const a = (a0 - 90 * i / ARC) * DEG;
      pts.push([ox + cx + R * Math.cos(a), oz + cz + R * Math.sin(a)]);
    }
  }
  if (half) { pts.unshift([ox + A, oz + ZC]); pts.push([ox - A, oz + ZC]); }
  return pts;
}

// Lofted mound between plan rings given by a profile [[s, y], ...] (bottom → top), with top + bottom caps.
function moundGeo(prof, o = {}) {
  const half = o.half ?? true, ox = o.ox || 0, oz = o.oz || 0, k = o.k || 1;
  const rings = prof.map(([s, y]) => outline(s, { half, k, ox, oz }).map(([x, z]) => new THREE.Vector3(x, y, z)));
  const pos = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), hint = new THREE.Vector3();
  const tri = (a, b, c, h) => {
    ab.subVectors(b, a); ac.subVectors(c, a);
    if (ab.cross(ac).dot(h) < 0) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const m = rings[0].length;
  const segs = half ? m - 1 : m;
  for (let r = 0; r < rings.length - 1; r++) {
    const lo = rings[r], hi = rings[r + 1];
    const ds = prof[r + 1][0] - prof[r][0], dy = prof[r + 1][1] - prof[r][1];
    const L = Math.hypot(ds, dy);
    const ns = dy / L, ny = ds / L;          // outward normal in (out-of-plan, up)
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % m;
      const hx = (lo[i].x + lo[j].x) / 2 - ox, hz = (lo[i].z + lo[j].z) / 2 - oz;
      const hl = Math.hypot(hx, hz) || 1;
      hint.set(hx / hl * ns, ny, hz / hl * ns);
      tri(lo[i], lo[j], hi[j], hint);
      tri(lo[i], hi[j], hi[i], hint);
    }
  }
  const cap = (ring, dir) => {
    const c = new THREE.Vector3();
    ring.forEach(p => c.add(p));
    c.multiplyScalar(1 / ring.length);
    const h = new THREE.Vector3(0, dir, 0);
    for (let i = 0; i < ring.length; i++) tri(c, ring[i], ring[(i + 1) % ring.length], h);
  };
  if (o.top !== false) cap(rings[rings.length - 1], 1);
  if (o.bottom !== false) cap(rings[0], -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Planar polygon in the section plane, facing +z.
function sectionGeo(contour, z = ZC) {
  const v2 = contour.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(v2, []);
  const pos = [];
  for (const [ia, ib, ic] of tris) {
    const a = v2[ia], b = v2[ib], c = v2[ic];
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (const p of (cr > 0 ? [a, b, c] : [a, c, b])) pos.push(p.x, p.y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Section outline of surface t: left toe → over the top → right toe, as [x, y] points.
function sectionProfile(t) {
  const P = PROF[t];
  const left = P.map(([s, y]) => [-(A0 - s), y]);
  const right = P.slice().reverse().map(([s, y]) => [A0 - s, y]);
  return [...left, ...right];
}
const band = (t1, t2) => [...sectionProfile(t2), ...sectionProfile(t1).reverse()];

const polySegs = (pts, z, closed = false) => {
  const s = [];
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    s.push(a[0], a[1], z, b[0], b[1], z);
  }
  return s;
};

// Ink edges of a geometry with a filter keep(a, b, kind), so a part can leave its edges in the cut plane
// to the section drawing.
function inkEdges(geo, o = {}) {
  const e = extractEdges(geo, o.crease ?? 28);
  const P = [], NA = [], NB = [], K = [];
  for (let i = 0; i < e.kind.length; i++) {
    const a = [e.positions[i * 6], e.positions[i * 6 + 1], e.positions[i * 6 + 2]];
    const b = [e.positions[i * 6 + 3], e.positions[i * 6 + 4], e.positions[i * 6 + 5]];
    if (o.keep && !o.keep(a, b, e.kind[i])) continue;
    P.push(...a, ...b);
    NA.push(e.na[i * 3], e.na[i * 3 + 1], e.na[i * 3 + 2]);
    NB.push(e.nb[i * 3], e.nb[i * 3 + 1], e.nb[i * 3 + 2]);
    K.push(e.kind[i]);
  }
  const g = new LineSegmentsGeometry();
  g.setPositions(P.length ? P : [0, 0, 0, 0, 0, 0]);
  g.setAttribute('instanceNA', new THREE.InstancedBufferAttribute(new Float32Array(NA.length ? NA : [0, 1, 0]), 3));
  g.setAttribute('instanceNB', new THREE.InstancedBufferAttribute(new Float32Array(NB.length ? NB : [0, 1, 0]), 3));
  g.setAttribute('instanceKind', new THREE.InstancedBufferAttribute(new Float32Array(K.length ? K : [-1]), 1));
  const m = new InkLineMaterial({
    edgeMode: true, color: o.color ?? C.edge, color2: o.color2 ?? C.crease,
    width: o.width ?? LW.silhouette, width2: o.width2 ?? LW.crease, clippingPlanes: o.clip || null,
  });
  return new InkLines(g, m);
}
const offSection = (a, b) => !(Math.abs(a[2] - ZC) < 1e-3 && Math.abs(b[2] - ZC) < 1e-3);

export default defineDiagram({
  id: 's14-nanjido',
  states: 2,
  region: { x: 100, y: 300, w: 1000, h: 660 },
  stage: {
    view: { azimuth: 30, elevation: 32, target: [0, 0, 0], scale: 2.4, at: [616, 524] },
    shadowBox: { min: [-130, -2, -300], max: [130, 100, ZC + 4] },
  },
  build(S) {
    const clipRise = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);   // keeps y <= constant
    const clipCap = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e4);    // keeps x <= constant
    const clipSoil = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e4);

    const mesh = (geo, mat, parent, shadow = true) => {
      const me = new THREE.Mesh(geo, mat);
      me.castShadow = shadow; me.receiveShadow = true;
      parent.add(me);
      return me;
    };

    // ================= second mound (quiet silhouette, behind) =================
    const ghost = S.part('Second mound');
    const GK = 0.72, GX = -60, GZ = -205;
    const ghostGeo = moundGeo(PROF[0], { half: false, k: GK, ox: GX, oz: GZ });
    mesh(ghostGeo, S.material(C.model), ghost, true);
    ghost.add(inkEdges(ghostGeo, { color: C.outline, color2: '#E2E1DE', width: 1.0, width2: 0.6 }));

    // ================= the waste mound (3D surfaces) =================
    const waste = S.part('Waste mound');
    const wasteGeo = moundGeo(PROF[0]);
    mesh(wasteGeo, S.material(C.model, { unique: true, clippingPlanes: [clipRise] }), waste);
    waste.add(inkEdges(wasteGeo, { keep: offSection, clip: [clipRise] }));
    // moving top surface while the mound rises
    const capN = outline(0).length;
    const riseCapGeo = new THREE.BufferGeometry();
    riseCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(capN * 9), 3));
    const riseCap = mesh(riseCapGeo, S.material(C.model, { unique: true }), waste, false);
    const riseCapLine = S.lines([0, 0, 0, 1, 0, 0], { width: LW.silhouette, color: C.edge }, waste);
    riseCap.receiveShadow = false;   // the rising top is the highest surface: keep it white
    riseCap.visible = riseCapLine.visible = false;
    function setRiseCap(h) {
      const pts = outline(setbackAt(0, h));
      const a = riseCapGeo.attributes.position.array;
      let cx = 0, cz = 0;
      pts.forEach(([x, z]) => { cx += x; cz += z; });
      cx /= pts.length; cz /= pts.length;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a.set([cx, h, cz, p[0], h, p[1], q[0], h, q[1]], i * 9);
      }
      riseCapGeo.attributes.position.needsUpdate = true;
      riseCapGeo.computeVertexNormals();
      riseCapGeo.computeBoundingSphere();
      const seg = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        seg.push(p[0], h, p[1], q[0], h, q[1]);
      }
      riseCapLine.geometry.setPositions(seg);
    }

    // ================= sealed cap and soil (3D surfaces) =================
    const capPart = S.part('Sealed cap');
    const capGeo = moundGeo(PROF[T_CAP], { bottom: false });
    mesh(capGeo, S.material(C.model, { unique: true, clippingPlanes: [clipCap] }), capPart);
    capPart.add(inkEdges(capGeo, { keep: offSection, clip: [clipCap] }));

    const park = S.part('Haneul Park');
    const soilGeo = moundGeo(PROF[T_SOIL], { bottom: false });
    mesh(soilGeo, S.material(C.model, { unique: true, clippingPlanes: [clipSoil] }), park);
    park.add(inkEdges(soilGeo, { keep: offSection, clip: [clipSoil] }));

    // planting: fine vertical grass strokes on the plateau and, sparser, on the benches
    const R = rng(14);
    const ticks = [];
    const PS = PROF[T_SOIL];
    const yTop = topOf(T_SOIL);
    const sTop = PS[PS.length - 1][0];
    const inside = (s, x, z, m) => {
      const A = A0 - s, B = B0 - s, Rr = Math.max(4, R0 - s);
      if (Math.abs(x) > A - m || z < -(B - m) || z > ZC - m) return false;
      const dx = Math.max(0, Math.abs(x) - (A - Rr)), dz = Math.max(0, -z - (B - Rr));
      return Math.hypot(dx, dz) < Rr - m;
    };
    const aTop = A0 - sTop, bTop = B0 - sTop;
    for (let n = 0; n < 4000 && ticks.length < 300; n++) {
      const x = (R() * 2 - 1) * aTop, z = ZC - R() * (ZC + bTop);
      if (!inside(sTop, x, z, 1.4)) continue;
      ticks.push({ x, y: yTop, z, len: 1.3 + R() * 0.8 });
    }
    const plantLines = S.lines([0, 0, 0, 0, 0.01, 0], { width: LW.hair, color: C.hair }, park);

    // ================= the section drawing (everything in the cut plane) =================
    const section = S.part('Section');
    const ZL = ZC + 0.05;   // lines sit just in front of the cut faces
    const wastePoly = sectionProfile(0);
    mesh(sectionGeo(wastePoly), S.material(C.modelCut, { unique: true, clippingPlanes: [clipRise] }), section, false);
    // compacted waste strata: fine horizontal hairlines at irregular spacing between the lift lines
    const rs = rng(7);
    const strata = [];
    for (let y = 2.3; y < H - 1.2; y += 2.4 + rs() * 1.3) {
      if (Math.abs(y / LIFT - Math.round(y / LIFT)) * LIFT < 1.1) continue;
      const a = halfLen(0, y);
      strata.push(-a, y, ZL, a, y, ZL);
    }
    S.lines(strata, { width: LW.hair, color: C.hair, clippingPlanes: [clipRise] }, section);
    const liftSegs = [];
    for (let i = 1; i < NLIFT; i++) {
      const y = i * LIFT;
      const a = A0 - WASTE[2 * i - 1][0];      // the lift top meets the bench rim
      liftSegs.push(-a, y, ZL, a, y, ZL);
    }
    S.lines(liftSegs, { width: LW.crease, color: C.crease, clippingPlanes: [clipRise] }, section);
    const wasteOutline = S.lines(polySegs(wastePoly, ZL + 0.01, true), { width: LW.silhouette, color: C.edge, clippingPlanes: [clipRise] }, section);
    // cap band (white) and soil band (cut grey), each revealed by its own wipe
    const capBand = new THREE.Group(); section.add(capBand);
    mesh(sectionGeo(band(0, T_CAP)), S.material(C.model, { unique: true, clippingPlanes: [clipCap] }), capBand, false);
    S.lines(polySegs(sectionProfile(T_CAP), ZL + 0.01), { width: 1.3, color: C.edge, clippingPlanes: [clipCap] }, capBand);
    const soilBand = new THREE.Group(); section.add(soilBand);
    mesh(sectionGeo(band(T_CAP, T_SOIL)), S.material(C.modelCut, { unique: true, clippingPlanes: [clipSoil] }), soilBand, false);
    const sp = sectionProfile(T_SOIL);
    const soilEdge = [...polySegs(sp, ZL + 0.02), sp[0][0], 0, ZL + 0.02, -A0, 0, ZL + 0.02, A0, 0, ZL + 0.02, sp[sp.length - 1][0], 0, ZL + 0.02];
    S.lines(soilEdge, { width: LW.silhouette, color: C.edge, clippingPlanes: [clipSoil] }, soilBand);
    // grass in section: short strokes on the plateau and bench lines of the soil surface
    const secTicks = [];
    for (let i = 0; i < sp.length - 1; i++) {
      const [x0, y0] = sp[i], [x1, y1] = sp[i + 1];
      if (Math.abs(y1 - y0) > 1e-6 || y0 < 1) continue;            // horizontal runs only
      const len = Math.abs(x1 - x0), dir = Math.sign(x1 - x0);
      const step = 2.2;
      for (let d = 1.0; d < len - 0.8; d += step) secTicks.push({ x: x0 + dir * d, y: y0, z: ZL + 0.03, len: 1.4 });
    }
    const secTickLines = S.lines([0, 0, 0, 0, 0.01, 0], { width: LW.hair, color: C.hair }, section);

    // ================= gas collection wells (red, focal) =================
    const wells = S.part('Gas wells');
    const redMat = S.material(C.red, { roughness: 0.8 });
    const redEdges = { color: C.redDeep, color2: C.redDeep, width: 1.0, width2: 0.7, creaseAngle: 40 };
    const riserGeo = new THREE.CylinderGeometry(1.1, 1.1, 5.4, 24).translate(0, 2.1, 0);
    const headGeo = new THREE.CylinderGeometry(1.9, 1.9, 0.9, 24).translate(0, 5.2, 0);
    const makeHead = (x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      S.solid(riserGeo, { material: redMat, edges: redEdges, castShadow: false }, g);
      S.solid(headGeo, { material: redMat, edges: redEdges, castShadow: false }, g);
      wells.add(g);
      return g;
    };
    // wells in the cut plane: on the plateau and on the benches (bench centres of the soil surface)
    const benchX = b => A0 - (PS[2 * b - 1][0] + PS[2 * b][0]) / 2;      // b = 1..4
    const WELL_X = [0, -27, 27, -benchX(4), benchX(4), -benchX(2), benchX(2)];
    const secWells = WELL_X.map((x, i) => {
      const ys = soilY(x);
      const L = ys - PIPE_BOT;
      const pg = new THREE.Group();
      pg.position.set(x, ys, ZL + 0.06);
      S.solid(new THREE.BoxGeometry(PIPE_W, L, 0.5).translate(0, -L / 2, 0.25),
        { material: redMat, edges: { color: C.redDeep, color2: C.redDeep, width: 0.9, width2: 0.6 }, castShadow: false }, pg);
      wells.add(pg);
      const head = makeHead(x, ys, ZC - 1.2);
      return { x, ys, pg, head, order: i === 0 ? 0 : Math.ceil(i / 2) };
    });
    const fieldHeads = [];
    for (const z of [2, -22]) for (const x of [-27, 0, 27]) fieldHeads.push(makeHead(x + (z < 0 ? 13.5 : 0), yTop, z));

    // clipped parts must clip their shadows too (otherwise the hidden, unclipped mass shades the rising top)
    S.world.traverse(o => {
      const m = o.isMesh && o.material;
      if (m && m.clippingPlanes && m.clippingPlanes.length) m.clipShadows = true;
    });

    // ================= animation =================
    // 1. the mound rises lift by lift (a rising cut with a moving top surface); the second mound follows
    S.anim.prop('mound', 0, v => {
      let h = 0;
      for (let i = 0; i < NLIFT; i++) h += LIFT * sub(v, 0.02 + i * 0.15, 0.02 + i * 0.15 + 0.27, ease.out);
      const done = v >= 0.9995;
      clipRise.constant = done ? 1e4 : h;
      waste.visible = section.visible = v > 0.0005;
      riseCap.visible = riseCapLine.visible = !done && h > 0.05;
      if (riseCap.visible) setRiseCap(h);
      const g = sub(v, 0.3, 0.9, ease.out);
      ghost.visible = g > 0.001;
      ghost.scale.y = Math.max(0.001, g);
    }, { kind: 'reveal', dur: 2300 });

    // 2a. the sealed cap is laid across the mound, 2b. the soil follows
    const wipe = (plane, part, extra, v) => {
      plane.constant = v >= 0.9995 ? 1e4 : -135 + 270 * v;
      part.visible = extra.visible = v > 0.0005;
    };
    S.anim.prop('cap', 0, v => {
      wipe(clipCap, capPart, capBand, ease.inOut(v));
      const w = LW.silhouette + (1.0 - LW.silhouette) * sub(v, 0, 0.6);
      wasteOutline.material.uniforms.uWidthA.value = w;
      wasteOutline.material.uniforms.uWidthB.value = w;
    }, { kind: 'reveal', dur: 1000 });
    S.anim.prop('soil', 0, v => wipe(clipSoil, park, soilBand, ease.inOut(v)), { kind: 'reveal', dur: 1000 });

    // 2c. planting grows in a wave from left to right
    const tickPos = (list, v) => {
      const out = [];
      for (const t of list) {
        const a = 0.55 * (t.x + 120) / 240;
        const k = sub(v, a, a + 0.45, ease.out);
        if (k < 0.02) continue;
        out.push(t.x, t.y, t.z, t.x, t.y + t.len * k, t.z);
      }
      return out;
    };
    S.anim.prop('plant', 0, v => {
      const p = tickPos(ticks, v), q = tickPos(secTicks, v);
      plantLines.visible = p.length > 0;
      secTickLines.visible = q.length > 0;
      if (p.length) plantLines.geometry.setPositions(p);
      if (q.length) secTickLines.geometry.setPositions(q);
    }, { kind: 'reveal', dur: 900 });

    // 2d. gas wells: risers rise, pipes drill down through the waste, then the field of well heads
    S.anim.prop('wells', 0, v => {
      wells.visible = v > 0.0005;
      for (const w of secWells) {
        const d = w.order * 0.09;
        const r = sub(v, d, d + 0.22, ease.out);
        w.head.scale.y = Math.max(0.001, r);
        w.head.visible = r > 0.001;
        const p = sub(v, d + 0.1, d + 0.55, ease.inOut);
        w.pg.scale.y = Math.max(0.001, p);
        w.pg.visible = p > 0.001;
      }
      fieldHeads.forEach((g, i) => {
        const r = sub(v, 0.55 + i * 0.06, 0.8 + i * 0.06, ease.out);
        g.scale.y = Math.max(0.001, r);
        g.visible = r > 0.001;
      });
    }, { kind: 'reveal', dur: 1300 });

    // ================= labels (one column, left) =================
    const COLX = 306;
    const wL = secWells[5];
    const L1 = S.label({
      text: 'Layers of trash, about 90 m high',
      anchor: new THREE.Vector3(-13, 8.5, ZL + 0.02), anchorObj: section,
      place: { mode: 'column', x: COLX, side: 'left' }, maxWidth: 200, nowrap: false,
    });
    const L4 = S.label({
      text: 'Haneul Park on top',
      anchor: new THREE.Vector3(-aTop + 0.8, yTop, ZC - 12), anchorObj: park,
      place: { mode: 'column', x: COLX, side: 'left' },
    });
    const yCap = 12;
    const L2 = S.label({
      text: 'Sealed cap',
      anchor: new THREE.Vector3(-(halfLen(0, yCap) + halfLen(T_CAP, yCap)) / 2, yCap, ZL + 0.02), anchorObj: section,
      place: { mode: 'column', x: COLX, side: 'left' },
    });
    const L3 = S.label({
      text: 'Gas collection wells',
      anchor: new THREE.Vector3(wL.x - 1.1, wL.ys + 5.2, ZC - 1.2), anchorObj: wells,
      place: { mode: 'column', x: COLX, side: 'left' }, leaderTone: 'red',
    });
    labelProp(S, 'L1', L1);
    labelProp(S, 'L2', L2);
    labelProp(S, 'L3', L3);
    labelProp(S, 'L4', L4);

    return {
      targets: n => ({
        mound: n >= 1 ? 1 : 0, L1: n >= 1 ? 1 : 0,
        cap: n >= 2 ? 1 : 0, soil: n >= 2 ? 1 : 0, plant: n >= 2 ? 1 : 0, wells: n >= 2 ? 1 : 0,
        L2: n >= 2 ? 1 : 0, L3: n >= 2 ? 1 : 0, L4: n >= 2 ? 1 : 0,
      }),
      plan(name, from, to, dir) {
        if (dir < 0) {
          if (name[0] === 'L') return { delay: 0, dur: 260, ease: ease.in };
          return { delay: 180, dur: 620, ease: ease.inOut };
        }
        // props that stagger their own sub-motions run on a linear clock (their parts carry the easing)
        const lin = ease.linear;
        const seq = {
          mound: { delay: 0, ease: lin }, L1: { delay: 2250 },
          cap: { delay: 0, ease: lin }, soil: { delay: 380, ease: lin }, plant: { delay: 900, ease: lin }, wells: { delay: 1150, ease: lin },
          L2: { delay: 1250 }, L4: { delay: 1800 }, L3: { delay: 2350 },
        };
        return seq[name] || null;
      },
    };
  },
});
