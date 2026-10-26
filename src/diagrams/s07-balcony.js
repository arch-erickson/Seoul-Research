// s07-balcony · Solar City Seoul: the balcony as power plant.
// A typical Korean slab apartment block (15 floors, 10 repeated balcony bays on the south face) as a white
// study model in axonometric.
//   State 1: the block rises; the balcony railings slide out of the wall floor by floor; the roof caps it.
//   State 2: solar panels (red, the focal element) unroll over the railings in a wave that sweeps up from the
//            lowest corner. A detail circle then opens beside the block: a sectional view through one balcony
//            showing the kit hooked over the railing and tilted out on two struts.
import { defineDiagram, THREE, C, ease, sub, lerp, labelProp, boxGeo, prismGeo, edgeLinesFromGeometry } from '../kit3d/index.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;

// ---------- model dimensions (metres) ----------
const NB = 9;               // balcony bays along the block
const BW = 4.8;             // bay module, fin centre to fin centre
const L = NB * BW;          // block length 43.2
const NF = 15;              // floors
const FH = 2.8;             // floor to floor
const BASE = 0.6;           // first balcony floor above grade
const H = BASE + NF * FH;   // top of the roof slab, 42.6
const ROOF_T = 0.35;        // roof slab
const HC = H - ROOF_T;      // top of walls and fins
const ZW = 5;               // south wall plane
const ZB = -7;              // north face
const P = 1.5;              // balcony depth = fin depth
const FIN = 0.24;           // balcony dividing walls
const BAND_T = 0.15;        // railing upstand thickness
const PAR_H = 1.1;          // railing height above the balcony floor
const SLAB_T = 0.2;
const PV_W = 1.65, PV_H = 1.0, PV_T = 0.05;   // one landscape module per balcony
const TILT = 30 * DEG;      // bottom edge kicked out from the railing
const PH = [{ x: -L * 0.27 }, { x: L * 0.27 }];   // roof penthouses (lift and stair)
const PH_W = 7.2, PH_H = 3.2, PH_D = 5.6, PH_Z = ZB + 0.6 + PH_D / 2;

// ---------- layout (design px inside the 760 x 640 region) ----------
const VIEW = { azimuth: -36, elevation: 27 };
const FIT = { x0: 24, y0: 24, x1: 520, y1: 552 };   // box the block is fitted into
const SRC = { bay: 7, floor: 3 };                    // balcony the detail circle refers to
const LENS = { x: 606, r: 132 };                     // detail circle (y derived from the label row)
const LENS_GAP = 18;                                 // circle to label
const LENS_FILL = 0.86;                              // core radius as a share of the circle radius
const CORE_ZY = [[0.25, -0.2], [1.5, -0.2], [1.5, 1.2], [0.25, 1.2]];   // (z, y) of the section that must read whole
const LENS_ROT = 42 * DEG;                           // piece turned to show its cut face
const LENS_DX = 0, LENS_DY = 16;                     // optical nudge of the piece inside the circle (px)
const X0 = -0.55, X1 = 5.5;                          // balcony piece: cut through the left bracket, runs out of the circle
const WALL_T = 0.25, WALL_H = 2.6, IN_Z = -2.6;      // wall (to the ceiling) and the floor slab running inside
const SRC_R = 17;                                    // small circle on the block (px)
const LBL_BAY = 0;                                   // panel the solar label points at (floor 0, wave origin)
const LBL_X = 24, LBL_Y = 588;                       // label row
const FRONT = 320;                                   // metres toward the camera for overlay geometry

// ---------- timing ----------
const BUILD_DUR = 1700;
const PV_DUR = 3400;
const WAVE = 0.34, PANEL_T = 0.13;                   // wave spread and per-panel unroll (fractions of PV_DUR)

// Split a grouped BufferGeometry (non-indexed) into one geometry per group.
function splitGroups(geo) {
  return geo.groups.map(gr => {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name];
      g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    }
    return g;
  });
}

// 45-degree style hatch of a simple polygon [[u, v], ...]: returns [u0, v0, u1, v1] segments inside it.
function hatch(poly, step, ang) {
  const n = [-Math.sin(ang), Math.cos(ang)], d = [Math.cos(ang), Math.sin(ang)];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
  let c0 = Infinity, c1 = -Infinity;
  for (const p of poly) { const c = dot(p, n); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const out = [];
  for (let c = Math.ceil(c0 / step) * step + step * 0.5; c < c1; c += step) {
    const ts = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const pc = dot(p, n) - c, qc = dot(q, n) - c;
      if ((pc < 0) !== (qc < 0)) {
        const t = pc / (pc - qc);
        ts.push(dot([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], d));
      }
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      out.push([c * n[0] + ts[i] * d[0], c * n[1] + ts[i] * d[1], c * n[0] + ts[i + 1] * d[0], c * n[1] + ts[i + 1] * d[1]]);
    }
  }
  return out;
}

// Split a non-indexed geometry by triangle: pred(a, b, c, normal) true -> first geometry.
function splitTris(geo, pred) {
  const pa = geo.attributes.position;
  const names = Object.keys(geo.attributes);
  const outA = {}, outB = {};
  for (const n of names) { outA[n] = []; outB[n] = []; }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < pa.count / 3; t++) {
    a.fromBufferAttribute(pa, 3 * t); b.fromBufferAttribute(pa, 3 * t + 1); c.fromBufferAttribute(pa, 3 * t + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    const dst = pred(a, b, c, n) ? outA : outB;
    for (const nm of names) {
      const at = geo.attributes[nm];
      for (let k = 0; k < 3; k++) for (let i = 0; i < at.itemSize; i++) dst[nm].push(at.array[(3 * t + k) * at.itemSize + i]);
    }
  }
  return [outA, outB].map(o => {
    const g = new THREE.BufferGeometry();
    for (const nm of names) g.setAttribute(nm, new THREE.Float32BufferAttribute(o[nm], geo.attributes[nm].itemSize));
    return g;
  });
}

export default defineDiagram({
  id: 's07-balcony',
  states: 2,
  region: { x: 100, y: 330, w: 760, h: 640 },
  stage: {
    view: { azimuth: VIEW.azimuth, elevation: VIEW.elevation, target: [0, 0, 0], scale: 9, at: [300, 400] },
    shadowBox: { min: [-L / 2 - 1, 0, ZB - 1], max: [L / 2 + 1, H + PH_H + 1, ZW + P + 1] },
    ground: false,
  },
  build(stage) {
    // ---- camera basis + fit the block's projected bounds into FIT ----
    const camR = new THREE.Vector3(), camU = new THREE.Vector3(), camF = new THREE.Vector3();
    const basis = () => { stage.camera.updateMatrixWorld(true); stage.camera.matrixWorld.extractBasis(camR, camU, camF); };
    basis();
    {
      const pts = [];
      const addBox = (x0, x1, y0, y1, z0, z1) => { for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, y, z)); };
      addBox(-L / 2 - 0.12, L / 2 + 0.12, 0, H + 0.9, ZB - 0.12, ZW + P + 0.12);
      addBox(-L / 2, L / 2, BASE, H, ZW + P, ZW + P + PV_H * Math.sin(TILT) + 0.06);
      for (const ph of PH) addBox(ph.x - PH_W / 2, ph.x + PH_W / 2, H, H + PH_H, PH_Z - PH_D / 2, PH_Z + PH_D / 2);
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const v of pts) {
        const sx = v.dot(camR), sy = v.dot(camU);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      const s = Math.min((FIT.x1 - FIT.x0) / (maxX - minX), (FIT.y1 - FIT.y0) / (maxY - minY));
      stage.view.scale = s;
      stage.view.at = [FIT.x0 - s * minX, FIT.y0 + s * maxY];
      stage.applyView();
      basis();
    }
    const S = stage.view.scale;
    const AT = stage.view.at;
    // design px -> world point on the view plane pushed `depth` metres toward the camera
    const fromScreen = (px, py, depth = 0) => new THREE.Vector3()
      .addScaledVector(camR, (px - AT[0]) / S).addScaledVector(camU, -(py - AT[1]) / S).addScaledVector(camF, depth);
    const box = (w, h, d, x, y, z) => boxGeo(w, h, d).translate(x, y, z);   // y = bottom

    // fins: x of each dividing wall; bays between them
    const finX = [];
    for (let k = 0; k <= NB; k++) finX.push(-L / 2 + k * BW);
    const bayL = i => (i === 0 ? -L / 2 + FIN : finX[i] + FIN / 2);
    const bayR = i => (i === NB - 1 ? L / 2 - FIN : finX[i + 1] - FIN / 2);
    const bayC = i => (bayL(i) + bayR(i)) / 2;
    const floorY = j => BASE + j * FH;

    // ================= 1. the block =================
    const slab = stage.part('Apartment block');
    const thin = { color: C.ink, color2: C.crease, width: 1.05, width2: 0.7 };
    const massG = new THREE.Group();
    slab.add(massG);
    // main mass with the two end walls carried out to the balcony face (one continuous gable)
    const foot = [
      [-L / 2, ZB], [L / 2, ZB], [L / 2, ZW + P], [L / 2 - FIN, ZW + P], [L / 2 - FIN, ZW],
      [-L / 2 + FIN, ZW], [-L / 2 + FIN, ZW + P], [-L / 2, ZW + P],
    ];
    stage.solid(prismGeo(foot, HC, 0), {}, massG);
    // inner dividing walls, from the first balcony slab up (the facade sits over a recessed base)
    const fins = [];
    const FIN_Y0 = BASE - SLAB_T;
    for (let k = 1; k < NB; k++) fins.push(box(FIN, HC - FIN_Y0, P, finX[k], FIN_Y0, ZW + P / 2));
    stage.solid(mergeGeometries(fins), { edges: thin }, massG);

    // balcony trays: floor slab + railing upstand per bay, one merged solid per floor; they slide out of the wall
    const trays = [];
    for (let j = 0; j < NF; j++) {
      const y0 = floorY(j), yb = y0 - SLAB_T;
      const parts = [];
      for (let i = 0; i < NB; i++) {
        const w = bayR(i) - bayL(i), cx = bayC(i);
        parts.push(box(w, SLAB_T, P - BAND_T, cx, yb, ZW + (P - BAND_T) / 2));
        parts.push(box(w, PAR_H + SLAB_T, BAND_T, cx, yb, ZW + P - BAND_T / 2));
      }
      const g = new THREE.Group();
      stage.solid(mergeGeometries(parts), { edges: thin }, g);
      slab.add(g);
      trays.push(g);
    }

    // roof: slab with a slight overhang, parapet, two penthouses
    const roof = new THREE.Group();
    roof.position.y = HC;
    slab.add(roof);
    {
      const zc = (ZW + P + ZB) / 2, dz = ZW + P - ZB;
      stage.solid(box(L + 0.24, ROOF_T, dz + 0.24, 0, 0, zc), {}, roof);
      const o = 0.12, t = 0.22;
      const outer = [[-L / 2 + o, ZB + o], [L / 2 - o, ZB + o], [L / 2 - o, ZW + P - o], [-L / 2 + o, ZW + P - o]];
      const inner = [[-L / 2 + o + t, ZB + o + t], [-L / 2 + o + t, ZW + P - o - t], [L / 2 - o - t, ZW + P - o - t], [L / 2 - o - t, ZB + o + t]];
      stage.solid(prismGeo(outer, 0.9, ROOF_T, { holes: [inner] }), { edges: thin }, roof);
      for (const ph of PH) stage.solid(box(PH_W, PH_H, PH_D, ph.x, ROOF_T, PH_Z), {}, roof);
    }

    // ================= 2. solar panels on every balcony railing =================
    const pv = stage.part('Solar panels');
    const panelGeo = boxGeo(PV_W, PV_H, PV_T).translate(0, -PV_H, PV_T / 2);   // hangs below its hinge
    const pvMat = stage.material(C.red, { roughness: 0.8 });
    const pvEdges = { color: C.redDeep, color2: C.redDeep, width: 0.95, width2: 0.6 };
    const panels = [];
    const hingeOf = (i, j) => new THREE.Vector3(bayC(i), floorY(j) + PAR_H - 0.02, ZW + P + 0.012);
    for (let j = 0; j < NF; j++) for (let i = 0; i < NB; i++) {
      const pivot = new THREE.Group();
      pivot.position.copy(hingeOf(i, j));
      pivot.rotation.x = -TILT;
      stage.solid(panelGeo, { material: pvMat, edges: pvEdges }, pivot);
      pv.add(pivot);
      const sp = stage.project(pivot.position);
      panels.push({ pivot, i, j, sx: sp.x, sy: sp.y });
    }
    // wave: radial on screen from the lowest panel (front corner, ground floor)
    const p0 = panels.reduce((a, b) => (b.sy > a.sy ? b : a));
    const dMax = Math.max(...panels.map(q => Math.hypot(q.sx - p0.sx, q.sy - p0.sy)));
    for (const q of panels) q.d = Math.hypot(q.sx - p0.sx, q.sy - p0.sy) / dMax;

    // ================= 3. label positions =================
    const lp = panels.find(q => q.i === LBL_BAY && q.j === 0);
    const lAnchor = lp.pivot.position.clone().add(new THREE.Vector3(0, -PV_H * Math.cos(TILT), PV_H * Math.sin(TILT) + PV_T * Math.cos(TILT)));
    const la = stage.project(lAnchor);
    const LENS_Y = LBL_Y - LENS_GAP - LENS.r;

    // ================= 4. detail: a cut piece of one balcony, enlarged in a circle =================
    const det = stage.part('Detail balcony');
    const frag = new THREE.Group();
    det.add(frag);
    const lensC = fromScreen(LENS.x, LENS_Y, FRONT);
    // clipping: a 64-gon around the circle (planes contain the view direction) + one wipe plane
    const planes = [];
    const NPL = 64;
    for (let k = 0; k < NPL; k++) {
      const a = (k / NPL) * Math.PI * 2;
      const d = new THREE.Vector3().addScaledVector(camR, Math.cos(a)).addScaledVector(camU, -Math.sin(a));
      planes.push(new THREE.Plane(d.clone().negate(), d.dot(lensC) + (LENS.r - 1) / S));
    }
    const wipe = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    planes.push(wipe);
    const mat = (color, o = {}) => stage.material(color, Object.assign({ unique: true, clippingPlanes: planes }, o));
    const mWhite = mat(C.model), mCut = mat(C.modelCut);
    const mRed = mat(C.red, { roughness: 0.8 });
    const eDet = { color: C.ink, color2: C.crease, width: 1.5, width2: 0.85, clippingPlanes: planes };
    const noShadow = { castShadow: false, receiveShadow: false };
    // concrete in section (z, y): wall stub, balcony floor slab, railing upstand
    const prof = [
      [IN_Z, -SLAB_T], [P, -SLAB_T], [P, PAR_H], [P - BAND_T, PAR_H], [P - BAND_T, 0], [0, 0], [0, WALL_H], [-WALL_T, WALL_H],
      [-WALL_T, 0], [IN_Z, 0],
    ];
    {
      const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: X1 - X0, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      g.translate(X0, 0, 0);
      g.computeVertexNormals();
      // cut faces (both ends + the top of the wall stub) light grey, the rest white; one material per mesh
      const [caps, sides] = splitGroups(g);
      const [wallTop, rest] = splitTris(sides, (a, b, c, n) => (n.y > 0.99 && a.y > WALL_H - 1e-3) || n.z < -0.99 && a.z < IN_Z + 1e-3);
      stage.solid(caps, { material: mCut, edges: false, ...noShadow }, frag);
      stage.solid(wallTop, { material: mCut, edges: false, ...noShadow }, frag);
      stage.solid(rest, { material: mWhite, edges: false, ...noShadow }, frag);
      frag.add(edgeLinesFromGeometry(g, eDet));
      // the cut outline on the near end, drawn heavier (section convention)
      const o = [];
      const xo = X0 - 0.004;
      for (let k = 0; k < prof.length; k++) {
        const a = prof[k], b = prof[(k + 1) % prof.length];
        o.push(xo, a[1], a[0], xo, b[1], b[0]);
      }
      stage.lines(o, { width: 1.8, color: C.ink, clippingPlanes: planes }, frag);
      // concrete hatch on the cut face (45 degree hairlines)
      const hs = [];
      for (const [z0, y0, z1, y1] of hatch(prof, 0.11, Math.PI / 4)) hs.push(xo - 0.002, y0, z0, xo - 0.002, y1, z1);
      stage.lines(hs, { width: 0.55, color: C.hair, clippingPlanes: planes }, frag);
      // the balcony door in the wall behind (frame hairlines)
      const dz = 0.006, d0 = X0 + 0.45, d1 = X0 + 2.6, d2 = X0 + 4.75, dh = 2.1;
      stage.lines([
        d0, 0, dz, d0, dh, dz, d0, dh, dz, X1, dh, dz, d1, 0, dz, d1, dh, dz, d2, 0, dz, d2, dh, dz,
      ], { width: 0.7, color: C.hair, clippingPlanes: planes }, frag);
    }
    // the kit: a bracket hooked over the railing (cut by the section plane) and one beyond it, the module on
    // the brackets' hinge, a strut from each bracket to the module's back
    const kit = new THREE.Group();
    frag.add(kit);
    const HZO = P + 0.035, HZI = P - BAND_T - 0.045, HYT = PAR_H + 0.09;   // bracket clearances
    const kp = new THREE.Group();
    kp.position.set(0, PAR_H - 0.08, HZO);
    kit.add(kp);
    // module from the cut (x = X0) to its right-hand edge; the cut face sits on the section plane
    const modGeo = boxGeo(PV_W / 2 - X0, PV_H, PV_T).translate((PV_W / 2 + X0) / 2, -PV_H, PV_T / 2);
    stage.solid(modGeo, { material: mRed, edges: { color: C.redDeep, color2: C.redDeep, width: 1.4, width2: 0.8, clippingPlanes: planes }, ...noShadow }, kp);
    {
      // cells of a 60-cell module (6 x 10), fine red-deep hairlines on the front face
      const fz = PV_T + 0.004, cells = [];
      for (let c = 1; c < 10; c++) { const x = -PV_W / 2 + c * PV_W / 10; if (x > X0 + 0.02) cells.push(x, -0.025, fz, x, -PV_H + 0.025, fz); }
      for (let r = 1; r < 6; r++) { const y = -r * PV_H / 6; cells.push(X0 + 0.004, y, fz, PV_W / 2 - 0.025, y, fz); }
      stage.lines(cells, { width: 0.6, color: C.redDeep, opacity: 0.6, clippingPlanes: planes }, kp);
    }
    const HOOK_X = [X0 + 0.01, -X0];
    {
      const hw = [];
      for (const hx of HOOK_X) {
        hw.push(hx, PAR_H - 0.09, HZO, hx, HYT, HZO);
        hw.push(hx, HYT, HZO, hx, HYT, HZI);
        hw.push(hx, HYT, HZI, hx, PAR_H - 0.34, HZI);
      }
      stage.lines(hw, { width: 2.2, color: C.ink, clippingPlanes: planes }, kit);
    }
    const strut = stage.lines([0, 0, 0, 0, 0, 0], { width: 1.8, color: C.ink, clippingPlanes: planes }, kit);
    const STRUT_Y = PAR_H - 0.74, STRUT_ON = 0.82;
    const _q = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0);
    const setStruts = tilt => {
      const seg = [];
      for (const hx of HOOK_X) {
        _q.set(0, -STRUT_ON * PV_H, 0).applyAxisAngle(_x, -tilt).add(kp.position);
        seg.push(hx, STRUT_Y, P + 0.003, hx, _q.y, _q.z);
      }
      strut.geometry.setPositions(seg);
      strut.visible = tilt > 0.02;
    };
    // fit: turn the piece, measure its screen extent with the kit in place, scale it to fill the circle, centre it
    let LENS_K = 1;
    const DEV = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new Map();
    const LROT = DEV.get('lrot') !== null && DEV.get('lrot') !== undefined ? +DEV.get('lrot') * DEG : LENS_ROT;
    const LFILL = DEV.get('lfill') ? +DEV.get('lfill') : LENS_FILL;
    {
      frag.rotation.y = LROT;
      kp.rotation.x = -TILT;
      frag.updateMatrixWorld(true);
      // the core that must read whole: balcony floor, railing, wall foot, module in place
      const core = [];
      for (const x of [X0, X0 + 0.6]) for (const [z, y] of CORE_ZY) core.push(new THREE.Vector3(x, y, z).applyMatrix4(frag.matrixWorld));
      for (const x of [X0, PV_W / 2]) for (const y of [0, -PV_H]) for (const z of [0, PV_T]) core.push(new THREE.Vector3(x, y, z).applyMatrix4(kp.matrixWorld));
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      const sp = [];
      for (const v of core) {
        const sx = v.dot(camR), sy = v.dot(camU);
        sp.push(sx, sy);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      // radius of the core around its bbox centre -> scale so it fills LFILL of the circle radius
      const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
      let rad = 0;
      for (let i = 0; i < sp.length; i += 2) rad = Math.max(rad, Math.hypot(sp[i] - mx, sp[i + 1] - my));
      LENS_K = (LENS.r * LFILL) / (S * rad);
      const cx = (minX + maxX) / 2 - LENS_DX / (S * LENS_K), cy = (minY + maxY) / 2 + LENS_DY / (S * LENS_K);
      frag.scale.setScalar(LENS_K);
      frag.position.copy(lensC).addScaledVector(camR, -cx * LENS_K).addScaledVector(camU, -cy * LENS_K);
      kp.rotation.x = 0;
    }
    // wipe direction: from the block toward the circle (screen), as a world vector
    const srcPt = new THREE.Vector3(bayC(SRC.bay), floorY(SRC.floor) + PAR_H - 0.45, ZW + P + 0.25);
    const srcS = stage.project(srcPt);
    const ang = Math.atan2(LENS_Y - srcS.y, LENS.x - srcS.x);
    const wu = new THREE.Vector3().addScaledVector(camR, Math.cos(ang)).addScaledVector(camU, -Math.sin(ang));
    const setWipe = w => { wipe.normal.copy(wu).negate(); wipe.constant = wu.dot(lensC) + w / S; };   // keeps wu·(p-c) <= w px
    const KIT_LIFT = 2.6;

    // ================= 5. callout: small circle on the block, connector, detail circle =================
    const callout = stage.part('Detail callout');
    const FR2 = FRONT + 90;
    const arc = (cx, cy, r, a0, a1, n) => {
      const out = [];
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = a0 + (a1 - a0) * (k / n);
        const p = fromScreen(cx + r * Math.cos(t), cy + r * Math.sin(t), FR2);
        if (prev) out.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
      return out;
    };
    const cStyle = { width: 1.1, color: C.ink };
    const cSmall = stage.lines(arc(srcS.x, srcS.y, SRC_R, ang, ang + Math.PI * 2, 72), cStyle, callout);
    const NA = 90;
    const cBigA = stage.lines(arc(LENS.x, LENS_Y, LENS.r, ang + Math.PI, ang + Math.PI * 2, NA), { width: 1.2, color: C.ink }, callout);
    const cBigB = stage.lines(arc(LENS.x, LENS_Y, LENS.r, ang + Math.PI, ang, NA), { width: 1.2, color: C.ink }, callout);
    const ca = fromScreen(srcS.x + SRC_R * Math.cos(ang), srcS.y + SRC_R * Math.sin(ang), FR2);
    const cb = fromScreen(LENS.x - LENS.r * Math.cos(ang), LENS_Y - LENS.r * Math.sin(ang), FR2);
    const connG = new THREE.Group();
    connG.position.copy(ca);
    callout.add(connG);
    stage.lines([0, 0, 0, cb.x - ca.x, cb.y - ca.y, cb.z - ca.z], cStyle, connG);
    const drawOn = (l, t, n) => {
      const k = Math.round(t * n);
      l.geometry.instanceCount = k;
      l.visible = k > 0;
    };

    // ================= labels =================
    const lPV = stage.label({
      text: 'Solar panels on balcony railings', anchor: lAnchor, anchorObj: pv, leaderTone: 'red',
      place: { mode: 'fixed', x: LBL_X, y: LBL_Y, ax: 'left', ay: 'top' }, leader: 'v',
    });
    const lKit = stage.label({
      text: 'A kit renters can install',
      place: { mode: 'fixed', x: LENS.x, y: LBL_Y, ax: 'center', ay: 'top' }, leader: false,
    });

    if (typeof location !== 'undefined' && /[?&]dbg=1/.test(location.search)) {
      const pre = document.createElement('pre');
      pre.id = 'dbg';
      pre.textContent = JSON.stringify({ S, AT, la, LBL_Y, LENS_Y, LENS_K, srcS, p0: [p0.sx, p0.sy] });
      document.body.appendChild(pre);
    }

    // ================= animator props =================
    // beat 1: the mass extrudes; each floor's balcony tray slides out of the wall as the mass passes it; roof caps it
    const invOut = v => 1 - Math.cbrt(1 - Math.min(0.999999, v));
    const MASS_END = 0.62, TRAY_T = 0.2;
    const trayStart = trays.map((_, j) => MASS_END * invOut(Math.min(1, (floorY(j) + PAR_H) / HC)));
    stage.anim.prop('build', 0, p => {
      const m = sub(p, 0, MASS_END, ease.out);
      massG.scale.y = Math.max(1e-3, m);
      massG.visible = m > 0.001;
      trays.forEach((g, j) => {
        const t = sub(p, trayStart[j], Math.min(0.97, trayStart[j] + TRAY_T), ease.out);
        g.visible = t > 0.001;
        g.position.z = -(P + 0.05) * (1 - t);
      });
      const r = sub(p, 0.7, 1, ease.out);
      roof.visible = r > 0.001;
      roof.scale.y = Math.max(1e-3, r);
      slab.visible = p > 0.001;
    }, { kind: 'reveal', dur: BUILD_DUR });

    // beat 2: the panel wave, then the detail circle opens and the kit is hung on its railing
    stage.anim.prop('pv', 0, p => {
      for (const q of panels) {
        const t = sub(p, q.d * WAVE, q.d * WAVE + PANEL_T, ease.out);
        q.pivot.visible = t > 0.001;
        q.pivot.scale.y = Math.max(1e-3, t);
      }
      pv.visible = p > 0.001;
      drawOn(cSmall, sub(p, 0.44, 0.53, ease.inOut), 72);
      const c = sub(p, 0.51, 0.59, ease.inOut);
      connG.scale.setScalar(Math.max(1e-3, c));
      connG.visible = c > 0.001;
      const b = sub(p, 0.57, 0.75, ease.inOut);
      drawOn(cBigA, b, NA);
      drawOn(cBigB, b, NA);
      callout.visible = p > 0.44;
      const w = sub(p, 0.58, 0.77, ease.inOut);
      setWipe(lerp(-LENS.r - 2, LENS.r + 2, w));
      const k = sub(p, 0.74, 0.87, ease.out);
      kit.position.y = (1 - k) * KIT_LIFT;
      const tt = sub(p, 0.86, 0.98, ease.inOut);
      kp.rotation.x = -TILT * tt;
      setStruts(TILT * tt);
      frag.visible = w > 0.001;
      det.visible = w > 0.001;
    }, { kind: 'reveal', dur: PV_DUR });

    labelProp(stage, 'lPV', lPV, { delay: 1400 });
    labelProp(stage, 'lKit', lKit, { delay: PV_DUR - 80 });

    return {
      targets: n => ({ build: n >= 1 ? 1 : 0, pv: n >= 2 ? 1 : 0, lPV: n >= 2 ? 1 : 0, lKit: n >= 2 ? 1 : 0 }),
      plan: (name, from, to, dir, n, prev) => {
        if (dir > 0) {
          const after = prev < 1 && n >= 2 && name !== 'build' ? BUILD_DUR - 150 : 0;
          if (name === 'build') return { delay: 0, dur: BUILD_DUR, ease: ease.linear };
          if (name === 'pv') return { delay: after, dur: PV_DUR, ease: ease.linear };
          if (name === 'lPV') return { delay: after + 1450, dur: 520, ease: ease.out };
          if (name === 'lKit') return { delay: after + PV_DUR - 60, dur: 520, ease: ease.out };
        } else {
          if (name === 'lPV' || name === 'lKit') return { delay: 0, dur: 280, ease: ease.in };
          if (name === 'pv') return { delay: 140, dur: 1100, ease: ease.inOut };
          if (name === 'build') return { delay: prev >= 2 ? 1150 : 0, dur: 1000, ease: ease.inOut };
        }
        return null;
      },
    };
  },
});
