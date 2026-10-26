// s16-cheonggye: Cheonggyecheon before and after, as one sectional axonometric slice of the street.
// The stream runs left to right. The slice is cut along the stream (front face, z = ZC) and at both ends, so the
// section shows what lies under the road.
//  1 BEFORE: an elevated highway on hammerhead piers above the at-grade road deck; that deck is the roof of a
//    three-cell box culvert carrying the buried stream (blue).
//  2 AFTER: the highway lifts away and dissolves, the deck opens along the stream (a section front travels left
//    to right), blue water fills a stepped channel, then planted banks and walkways appear.
import {
  defineDiagram, THREE, C, LW, ease, sub, lerp, labelProp, rng, edgeLinesFromGeometry,
} from '../kit3d/index.js';

// ---------------- dimensions (m) ----------------
const L = 56, XA = -L / 2, XB = L / 2;      // length of the slice along the stream
const ZC = 4;                               // front section cut, along the stream
const ZB = -22;                             // back edge of the far street
const ZW = -16;                             // far street edge (top of the retaining wall after)
const Y_BOT = -7, Y_BED = -5.3;             // bottom of the model, culvert floor = stream bed
const Y_ROOF = -0.9;                        // underside of the road deck (culvert roof)
const CELLS = [[-13, -6.75], [-6.25, -0.25], [0.25, ZC]];
const Y_CWATER = -4.7;                      // water level inside the culvert
// after
const Y_WATER = -4.5, Z_WATER = -5.5;       // open water: z in [Z_WATER, ZC]
const Y_LOW = -4.1, Z_LOW = -8;             // lower walkway: z in [Z_LOW, Z_WATER]
const Y_UP = -2.4, Z_UP = -12.5;            // upper walkway: z in [ZW, Z_UP]; planted slope in between
// highway
const PIERS = [-19, 0, 19];
const SEGS = [[XA, -9.5], [-9.5, 9.5], [9.5, XB]];
const Y_DECK0 = 6.6, Y_DECK1 = 7.6, Y_PAR = 8.5, Z_HW0 = -8;
const Y_COL = 5.5;

const slopeY = z => lerp(Y_LOW, Y_UP, (z - Z_LOW) / (Z_UP - Z_LOW));

// ---------------- geometry helpers ----------------
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function bufGeo(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

// Extrude a cross-section profile [[z, y], ...] along x from x0 to x1. Faces on the front cut plane (z = ZC)
// and the flagged end caps are section cuts and go to `cut` (poché); everything else to `white`.
function extrudeX(prof, x0, x1, o = {}) {
  const endCut0 = o.endCut0 ?? true, endCut1 = o.endCut1 ?? true;
  const W = [], K = [];
  const n = prof.length;
  let A = 0;
  for (let i = 0; i < n; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[(i + 1) % n]; A += z0 * y1 - z1 * y0; }
  const ccw = A > 0;
  const tri = (arr, a, b, c) => arr.push(...a, ...b, ...c);
  for (let i = 0; i < n; i++) {
    const [za, ya] = prof[i], [zb, yb] = prof[(i + 1) % n];
    let nz = yb - ya, ny = -(zb - za);
    if (!ccw) { nz = -nz; ny = -ny; }
    const a = [x0, ya, za], b = [x1, ya, za], c = [x1, yb, zb], d = [x0, yb, zb];
    const isCut = Math.abs(za - ZC) < 1e-6 && Math.abs(zb - ZC) < 1e-6;
    const arr = isCut ? K : W;
    const nn = cross(sub3(b, a), sub3(c, a));
    if (nn[1] * ny + nn[2] * nz >= 0) { tri(arr, a, b, c); tri(arr, a, c, d); }
    else { tri(arr, a, c, b); tri(arr, a, d, c); }
  }
  const tris = THREE.ShapeUtils.triangulateShape(prof.map(([z, y]) => new THREE.Vector2(z, y)), []);
  for (const [i, j, k] of tris) {
    for (const [x, sgn, cut] of [[x0, -1, endCut0], [x1, 1, endCut1]]) {
      const p = [x, prof[i][1], prof[i][0]], q = [x, prof[j][1], prof[j][0]], r = [x, prof[k][1], prof[k][0]];
      const nn = cross(sub3(q, p), sub3(r, p));
      const arr = cut ? K : W;
      if (nn[0] * sgn >= 0) tri(arr, p, q, r); else tri(arr, p, r, q);
    }
  }
  return { white: bufGeo(W), cut: bufGeo(K), all: bufGeo([...W, ...K]) };
}

// Flat polygon in the plane x = 0 facing -x (the travelling section face of the opening deck).
function capGeo(prof) {
  const tris = THREE.ShapeUtils.triangulateShape(prof.map(([z, y]) => new THREE.Vector2(z, y)), []);
  const P = [];
  for (const [i, j, k] of tris) {
    const p = [0, prof[i][1], prof[i][0]], q = [0, prof[j][1], prof[j][0]], r = [0, prof[k][1], prof[k][0]];
    const nn = cross(sub3(q, p), sub3(r, p));
    if (nn[0] <= 0) P.push(...p, ...q, ...r); else P.push(...p, ...r, ...q);
  }
  return bufGeo(P);
}

// A small car: side profile extruded across its width (stands on y = 0, length along x).
function carGeo() {
  const s = new THREE.Shape();
  const pts = [[-2.2, 0.12], [2.2, 0.12], [2.22, 0.66], [1.4, 0.78], [0.72, 1.36], [-1.05, 1.36], [-1.72, 0.84], [-2.2, 0.78]];
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.76, bevelEnabled: false });
  g.translate(0, 0, -0.88);
  return g;
}

const rectProf = (z0, z1, y0, y1) => [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];

export default defineDiagram({
  id: 's16-cheonggye',
  states: 2,
  region: { x: 100, y: 320, w: 940, h: 300 },
  stage: {
    view: { azimuth: -16, elevation: 21, target: [0, 0, 0], scale: 10.2, at: [363, 165] },
    shadowBox: { min: [XA - 1, Y_BOT, ZB - 1], max: [XB + 1, Y_PAR + 1, ZC + 1] },
    ground: false,
  },
  build(stage) {
    const S = stage;
    const keep = (nx, c) => new THREE.Plane(new THREE.Vector3(nx, 0, 0), c);
    // clip planes driven by the props
    const pBefore = keep(1, -(XA - 1));   // keeps x >= w: the still-covered part, right of the opening front
    const pAfter = keep(-1, XA - 1);      // keeps x <= w: the opened part, left of the front
    const pDeck = keep(-1, XA - 1);       // highway deck being placed, keeps x <= wd
    const pCWater = keep(-1, XA - 1);     // buried stream drawn along the culvert, keeps x <= ww
    const mat = (color, planes) => {
      const m = S.material(color, planes ? { unique: true, clippingPlanes: planes } : {});
      if (planes) m.clipShadows = true;
      return m;
    };
    const MW = mat(C.model), MK = mat(C.modelCut);
    const edgeOpts = (o = {}) => ({
      color: o.color ?? C.edge, color2: o.color2 ?? C.crease,
      width: o.width ?? LW.silhouette, width2: o.width2 ?? LW.crease, creaseAngle: o.creaseAngle ?? 20,
      clippingPlanes: o.clip ?? null,
    });
    // a profile solid: white faces + poché cut faces + ink edges, with the section cut outlined at full weight
    // (the left end cut and the long front cut are the faces the camera sees)
    function profSolid(prof, x0, x1, o, parent) {
      const geo = extrudeX(prof, x0, x1, o);
      const g = new THREE.Group();
      const mw = new THREE.Mesh(geo.white, o.white || MW);
      const mk = new THREE.Mesh(geo.cut, o.cut || MK);
      for (const m of [mw, mk]) { m.castShadow = o.castShadow ?? true; m.receiveShadow = true; g.add(m); }
      const eo = edgeOpts(o.edges || {});
      g.add(edgeLinesFromGeometry(geo.all, eo));
      if (o.cutLine !== false) {
        const seg = [];
        const n = prof.length;
        for (let i = 0; i < n; i++) {
          const [za, ya] = prof[i], [zb, yb] = prof[(i + 1) % n];
          if (o.endCut0 ?? true) seg.push(x0, ya, za, x0, yb, zb);
          if (Math.abs(za - ZC) < 1e-6 && Math.abs(zb - ZC) < 1e-6) {
            seg.push(x0, ya, za, x1, ya, za, x0, yb, zb, x1, yb, zb, x1, ya, za, x1, yb, zb);
          }
        }
        if (seg.length) S.lines(seg, { width: o.cutWidth ?? 1.5, color: eo.color, clippingPlanes: eo.clippingPlanes }, g);
      }
      parent.add(g);
      return g;
    }

    // the ground group extrudes up from the bottom of the model on entry
    const groundWrap = new THREE.Group();
    groundWrap.position.y = Y_BOT;
    S.world.add(groundWrap);
    const gIn = new THREE.Group();
    gIn.position.y = -Y_BOT;
    groundWrap.add(gIn);

    // ================= shared ground: far street + base under the stream =================
    const ground = S.part('Ground', gIn);
    profSolid([[ZB, Y_BOT], [ZC, Y_BOT], [ZC, Y_BED], [ZW, Y_BED], [ZW, 0], [ZB, 0]], XA, XB, {}, ground);
    profSolid(rectProf(ZB, -19.6, 0, 0.16), XA, XB, { edges: { width: 1.1, width2: 0.7 } }, ground);   // far sidewalk

    // ================= BEFORE: road deck over the box culvert =================
    const MWb = mat(C.model, [pBefore]), MKb = mat(C.modelCut, [pBefore]);
    const covered = S.part('Covered road', gIn);
    const combProf = [[ZW, Y_BED], [CELLS[0][0], Y_BED]];
    for (let i = 0; i < CELLS.length; i++) {
      const [c0, c1] = CELLS[i];
      combProf.push([c0, Y_ROOF]);
      if (i < CELLS.length - 1) combProf.push([c1, Y_ROOF], [c1, Y_BED], [CELLS[i + 1][0], Y_BED]);
      else combProf.push([c1, Y_ROOF]);
    }
    combProf.push([ZC, 0], [ZW, 0]);
    profSolid(combProf, XA, XB, { white: MWb, cut: MKb, edges: { clip: [pBefore] } }, covered);
    const roadLines = [];
    for (const z of [-12.4, -8.8, -1.6]) roadLines.push(XA + 0.4, 0.02, z, XB - 0.4, 0.02, z);
    const roadDash = S.lines(roadLines, { width: LW.hair, color: C.hair, dashed: true, dashSize: 3, gapSize: 4.5, clippingPlanes: [pBefore] }, covered);
    const roadMedian = S.lines([XA, 0.02, -5.12, XB, 0.02, -5.12, XA, 0.02, -5.38, XB, 0.02, -5.38], { width: LW.hair, color: C.hair, clippingPlanes: [pBefore] }, covered);

    // the buried stream (blue) in the culvert cells
    const buried = S.part('Buried stream', gIn);
    const MBb = mat(C.blue, [pBefore, pCWater]);
    for (const [c0, c1] of CELLS) {
      profSolid(rectProf(c0, c1, Y_BED, Y_CWATER), XA, XB, {
        white: MBb, cut: MBb, castShadow: false,
        edges: { color: C.blueDeep, color2: C.blueDeep, width: 1.0, width2: 0.7, clip: [pBefore, pCWater] },
      }, buried);
    }

    // travelling section face of the deck while it opens (faces the camera, -x)
    const capPart = S.part('Opening front', gIn);
    const cap = new THREE.Group();
    capPart.add(cap);
    S.solid(capGeo(combProf), { material: MK, castShadow: false }, cap);
    for (const [c0, c1] of CELLS) {
      S.solid(capGeo(rectProf(c0, c1, Y_BED, Y_CWATER)), {
        material: S.material(C.blue), castShadow: false,
        edges: { color: C.blueDeep, color2: C.blueDeep, width: 1.0, width2: 0.7 },
      }, cap);
    }
    cap.visible = false;

    // ================= AFTER: stepped channel, water, planting, walkways =================
    const MWa = mat(C.model, [pAfter]), MKa = mat(C.modelCut, [pAfter]);
    const hairA = (segs, o = {}, parent) => S.lines(segs, Object.assign({ width: LW.hair, color: C.hair, clippingPlanes: [pAfter] }, o), parent);
    const banks = S.part('Banks', gIn);
    const bankProf = [[ZW, Y_BED], [Z_WATER, Y_BED], [Z_WATER, Y_LOW], [Z_LOW, Y_LOW], [Z_UP, Y_UP], [ZW, Y_UP]];
    profSolid(bankProf, XA, XB, { white: MWa, cut: MKa, edges: { clip: [pAfter] } }, banks);
    // stone coursing on the retaining wall (its face belongs to the far ground block)
    const course = [];
    for (const y of [-0.8, -1.6]) course.push(XA, y, ZW + 0.02, XB, y, ZW + 0.02);
    const wallLines = hairA(course, {}, banks);

    const stream = S.part('Stream', gIn);
    const MBa = mat(C.blue, [pAfter]);
    const waterPivot = new THREE.Group();          // fills from a narrow, shallow stream at the front to the full channel
    waterPivot.position.set(0, Y_BED, ZC);
    stream.add(waterPivot);
    const waterIn = new THREE.Group();
    waterIn.position.set(0, -Y_BED, -ZC);
    waterPivot.add(waterIn);
    profSolid(rectProf(Z_WATER, ZC, Y_BED, Y_WATER), XA, XB, {
      white: MBa, cut: MBa, castShadow: false,
      edges: { color: C.blueDeep, color2: C.blueDeep, width: 1.2, width2: 0.8, clip: [pAfter] },
    }, waterIn);
    // a few long flow lines on the water surface
    const flow = [];
    const rf = rng(5);
    for (const z of [-3.7, -1.2, 1.5]) {
      let x = XA + 1 + rf() * 3;
      while (x < XB - 3) { const len = 3 + rf() * 5; flow.push(x, Y_WATER + 0.015, z + (rf() - 0.5) * 0.5, Math.min(XB - 1, x + len), Y_WATER + 0.015, z + (rf() - 0.5) * 0.5); x += len + 2 + rf() * 4; }
    }
    const flowLines = S.lines(flow, { width: 0.8, color: '#FFFFFF', opacity: 0.55, clippingPlanes: [pAfter] }, waterIn);

    // walkways: paving joints, railing on the wall top, stepping stones, a few people
    const walk = S.part('Walkways', gIn);
    const MWw = mat(C.model, [pAfter]);
    const pave = [];
    for (let x = XA + 1.4; x < XB - 0.5; x += 2.8) {
      pave.push(x, Y_LOW + 0.01, Z_LOW + 0.05, x, Y_LOW + 0.01, Z_WATER - 0.05);
      pave.push(x, Y_UP + 0.01, ZW + 0.05, x, Y_UP + 0.01, Z_UP - 0.05);
    }
    const paveLines = hairA(pave, {}, walk);
    const rail = [];
    const zr = ZW + 0.25;
    for (let x = XA + 1.4; x < XB - 0.5; x += 2.8) rail.push(x, 0, zr, x, 1.0, zr);
    rail.push(XA, 1.0, zr, XB, 1.0, zr, XA, 0.55, zr, XB, 0.55, zr);
    const railLines = hairA(rail, { color: C.crease }, walk);
    const stones = [];
    const stoneH = Y_WATER + 0.28 - Y_BED;
    const stoneGeo = new THREE.BoxGeometry(1.0, stoneH, 0.72).translate(0, stoneH / 2, 0);
    for (const sx of [-12.6, 11.2]) {
      for (let z = Z_WATER + 0.75; z < ZC - 0.4; z += 1.25) {
        const g = new THREE.Group();
        g.position.set(sx, Y_BED, z);
        S.solid(stoneGeo, { material: MWw, edges: { width: 0.9, width2: 0.6, clippingPlanes: [pAfter] } }, g);
        walk.add(g);
        stones.push(g);
      }
    }
    const people = [];
    const figProf = [[0.001, 0], [0.14, 0], [0.16, 0.8], [0.21, 0.98], [0.24, 1.3], [0.16, 1.39], [0.08, 1.42], [0.12, 1.47], [0.135, 1.57], [0.09, 1.67], [0.001, 1.7]];
    const figGeo = new THREE.LatheGeometry(figProf.map(([r, y]) => new THREE.Vector2(r, y)), 12);
    const P_AT = [[-19.5, Y_LOW, -6.9], [-17.9, Y_LOW, -6.5], [3.6, Y_LOW, -6.7], [-5.5, Y_UP, -14.2], [16.8, Y_UP, -14.4], [11.2, Y_WATER + 0.28, -0.25]];
    for (const [x, y, z] of P_AT) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      S.solid(figGeo, { material: MWw, creaseAngle: 60, edges: { width: 0.75, width2: 0.5, clippingPlanes: [pAfter] } }, g);
      walk.add(g);
      people.push(g);
    }

    // planting: willows along the top of the bank, grass on the slope, reeds at the water's edge
    const plant = S.part('Planting', gIn);
    const MWp = S.material(C.model, { unique: true, clippingPlanes: [pAfter], offsetFactor: 0.4, offsetUnits: 1 });
    MWp.clipShadows = true;
    const MWt = mat(C.model, [pAfter]);
    const R = rng(16);
    const trees = [];
    const crownGeo = new THREE.SphereGeometry(1, 24, 16);
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 1, 7).translate(0, 0.5, 0);
    const TREE = [[-23.2, 2.0], [-16.9, 2.3], [-10.4, 1.95], [-4.1, 2.25], [2.4, 2.0], [8.8, 2.3], [15.3, 1.95]];
    for (const [tx, r] of TREE) {
      const z = -11.5 + (R() - 0.5) * 0.5;
      const g = new THREE.Group();
      g.position.set(tx + (R() - 0.5) * 0.8, slopeY(z), z);
      const th = 0.75 + r * 0.35;                    // clear trunk below the crown
      const trunk = S.solid(trunkGeo, { material: MWt, edges: { width: 0.9, width2: 0.6, clippingPlanes: [pAfter] } }, g);
      trunk.scale.y = th + r * 0.5;
      const cr = S.solid(crownGeo, { material: MWp, edges: { width: 1.1, width2: 0.6, clippingPlanes: [pAfter] } }, g);
      cr.scale.set(r, r * 0.9, r);
      cr.position.y = th + r * 0.9;
      g.userData.sc = 1;
      plant.add(g);
      trees.push(g);
    }
    // grass: rows of fine ticks on the planted slope
    const grass = [];
    for (let row = 0; row < 5; row++) {
      const z = lerp(Z_LOW - 0.45, Z_UP + 0.45, (row + 0.5) / 5);
      const y = slopeY(z);
      for (let x = XA + 0.6 + R() * 0.6; x < XB - 0.5; x += 0.85 + R() * 0.5) {
        const h = 0.26 + R() * 0.16, lean = (R() - 0.5) * 0.1;
        grass.push(x, y, z, x + lean - 0.13, y + h, z, x, y, z, x + lean + 0.13, y + h * 0.9, z);
      }
    }
    const grassLines = hairA(grass, { color: C.hair }, plant);
    const reedSeg = [];
    for (let i = 0; i < 20; i++) {
      const x = XA + 1.2 + i * ((L - 4.2) / 20) + R() * 1.1;
      if (x > XB - 2.5) continue;
      const z = Z_WATER + 0.22 + R() * 0.3;
      const h = 0.9 + R() * 0.45;
      for (const [dx, dz, k] of [[-0.3, 0.05, 0.82], [0, 0, 1], [0.24, 0.08, 0.9], [0.44, -0.04, 0.7]]) {
        reedSeg.push(x + dx * 0.3, Y_WATER, z + dz, x + dx, Y_WATER + h * k, z + dz * 2);
      }
    }
    const reeds = hairA(reedSeg, { color: C.crease }, plant);

    // ================= traffic =================
    const CAR = carGeo();
    const carEdges = { width: 1.0, width2: 0.55, creaseAngle: 24 };
    function car(parent, x, y, z, flip, material) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (flip) g.rotation.y = Math.PI;
      S.solid(CAR, { material, edges: carEdges }, g);
      parent.add(g);
      return g;
    }
    const farTraffic = S.part('Side road traffic');
    const farCars = [[-20.5, -17.8], [-1.5, -17.8], [14.5, -17.8]].map(([x, z]) => car(farTraffic, x, 0, z, false, MW));
    const deckTraffic = S.part('Road traffic');
    const MWdt = S.material(C.model, { unique: true });
    const deckCars = [[-21.5, -14.2], [-6, -10.6], [10, -14.2], [-14.5, -3.4], [4, 0.2], [18.5, -3.4], [-24, 2.4]]
      .map(([x, z]) => car(deckTraffic, x, 0, z, z > -5.2, MWdt));

    // renderOrder for a fading group: meshes at `base`, their ink lines right after
    function order(g, base) {
      g.traverse(o => { if (o.isInkLines) o.renderOrder = base + 1; else if (o.isMesh) o.renderOrder = base; });
    }

    // ================= the elevated highway =================
    const hwy = S.part('Elevated highway');
    const segs = [];
    // hammerhead pier cap (cross-section, cut by the front plane at z = ZC)
    const capProf = [[-7, Y_DECK0], [ZC, Y_DECK0], [ZC, 5.767], [1.6, Y_COL], [-1.6, Y_COL], [-7, 6.1]];
    const deckProf = [[Z_HW0, Y_DECK0], [ZC, Y_DECK0], [ZC, Y_DECK1], [Z_HW0 + 0.4, Y_DECK1], [Z_HW0 + 0.4, Y_PAR], [Z_HW0, Y_PAR]];
    SEGS.forEach(([x0, x1], i) => {
      const seg = new THREE.Group();
      hwy.add(seg);
      const mw = mat(C.model, [pDeck]), mk = mat(C.modelCut, [pDeck]);
      const deck = profSolid(deckProf, x0, x1, { white: mw, cut: mk, endCut0: x0 === XA, endCut1: x1 === XB, edges: { clip: [pDeck] } }, seg);
      const lanes = [];
      for (const z of [-4.25, -0.75]) lanes.push(x0 + 0.3, Y_DECK1 + 0.02, z, x1 - 0.3, Y_DECK1 + 0.02, z);
      const laneLines = S.lines(lanes, { width: LW.hair, color: C.hair, dashed: true, dashSize: 3, gapSize: 4.5, clippingPlanes: [pDeck] }, seg);
      // pier: column + hammerhead, rises from the road on entry
      const pier = new THREE.Group();
      pier.position.x = PIERS[i];
      const mwp = S.material(C.model, { unique: true }), mkp = S.material(C.modelCut, { unique: true });
      profSolid(capProf, -1.1, 1.1, { white: mwp, cut: mkp, endCut0: false, endCut1: false }, pier);
      profSolid(rectProf(-1.1, 1.1, 0, Y_COL), -0.8, 0.8, { white: mwp, cut: mkp, endCut0: false, endCut1: false }, pier);
      seg.add(pier);
      // traffic on this span
      const cars = [];
      const lanesZ = [-6.0, -2.5, 1.0];
      const at = [[[-23.5, 0], [-15.5, 2]], [[-6.5, 1], [-1.0, 0], [5.5, 2]], [[13, 1], [22, 0]]][i];
      for (const [x, li] of at) cars.push(car(seg, x, Y_DECK1, lanesZ[li], li === 2, mw));
      segs.push({ seg, pier, deck, lanes: laneLines, cars });
      // draw order while the span dissolves: deck shell first (it writes depth), then the cars on it, then the pier,
      // so nothing under the translucent deck shows through it
      order(deck, -6); order(laneLines, -6); cars.forEach(c => order(c, -4)); order(pier, -2);
    });
    deckTraffic.children.forEach(c => order(c, 2));

    // ================= motion =================
    // Both props write into closure state and one refresh() derives every transform from (B, O), so each frame is
    // a pure function of the two progress values (jumping and reversing work from any state).
    let B = 0, O = 0;
    // Dissolve a group without x-ray: every mesh gets a depth-only twin drawn at the end of the opaque pass, so
    // the translucent colour pass only keeps the group's front-most surfaces (nothing inside or behind shows through).
    const fade = (g, v) => {
      const on = v > 0.003 && v < 0.999;
      g.traverse(o => {
        if (o.isInkLines) o.material.setOpacity(v);
        else if (o.isMesh && !o.userData.depthOnly) {
          const m = o.material;
          if (o.userData.cs === undefined) {
            o.userData.cs = o.castShadow;
            const dm = new THREE.MeshBasicMaterial({
              colorWrite: false, depthWrite: true, polygonOffset: true,
              polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
            });
            if (m.clippingPlanes) dm.clippingPlanes = m.clippingPlanes;
            const twin = new THREE.Mesh(o.geometry, dm);
            twin.userData.depthOnly = true;
            twin.userData.auditIgnore = true;
            twin.renderOrder = 50;
            twin.castShadow = twin.receiveShadow = false;
            twin.position.copy(o.position); twin.quaternion.copy(o.quaternion); twin.scale.copy(o.scale);
            o.parent.add(twin);
            o.userData.twin = twin;
          }
          o.userData.twin.visible = on;
          const t = v < 0.999;
          if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
          m.opacity = v;
          m.depthWrite = !t;
          o.castShadow = o.userData.cs && v > 0.5;
        }
      });
      g.visible = v > 0.003;
    };
    const lineFade = (l, v) => { l.material.setOpacity(v); l.visible = v > 0.003; };
    const allCars = [...farCars, ...deckCars, ...segs.flatMap(s => s.cars)].sort((a, b) => a.position.x - b.position.x);
    function refresh() {
      // ---- BUILD (0 -> 1): ground extrudes, the stream runs along the culvert, piers rise, deck placed, traffic ----
      const kg = ease.out(sub(B, 0, 0.36));
      groundWrap.scale.y = Math.max(1e-3, kg);
      groundWrap.visible = B > 0.001;
      const ww = lerp(XA - 0.2, XB + 0.2, sub(B, 0.2, 0.56, ease.inOut));
      pCWater.constant = ww;
      const wd = lerp(XA - 0.2, XB + 0.2, sub(B, 0.46, 0.8, ease.inOut));
      pDeck.constant = wd;
      const kl = sub(B, 0.66, 0.92);
      lineFade(roadDash, kl); lineFade(roadMedian, kl);
      allCars.forEach((g, i) => {
        const s = sub(B, 0.74 + i * 0.008, 0.9 + i * 0.008, ease.out);
        g.scale.setScalar(Math.max(1e-3, s));
        g.visible = s > 0.001;
      });
      // ---- OPEN (1 -> 2): highway lifts away and dissolves; the deck opens; water fills; planting ----
      segs.forEach(({ seg, pier, deck, lanes }, i) => {
        const v = 1 - sub(O, 0.04 + i * 0.075, 0.3 + i * 0.075);
        fade(seg, v);
        seg.position.y = 4.5 * sub(O, 0.0 + i * 0.075, 0.3 + i * 0.075, ease.in);
        const s = sub(B, 0.3 + i * 0.07, 0.52 + i * 0.07, ease.out);
        pier.scale.y = Math.max(1e-3, s);
        pier.visible = s > 0.001;
        deck.visible = wd > XA;
        lanes.material.setOpacity(kl * v);
        lanes.visible = wd > XA && kl * v > 0.003;
      });
      fade(deckTraffic, 1 - sub(O, 0.03, 0.22));
      const w = lerp(XA - 0.2, XB + 0.2, sub(O, 0.28, 0.68, ease.inOut));
      pBefore.constant = -w;
      pAfter.constant = w;
      cap.position.x = w;
      cap.visible = w > XA + 0.01 && w < XB - 0.01;
      covered.visible = w < XB;
      buried.visible = ww > XA && w < XB;
      for (const part of [banks, stream, walk, plant]) part.visible = w > XA;
      const f = sub(O, 0.5, 0.8, ease.inOut);
      waterPivot.scale.set(1, lerp(0.3, 1, f), lerp(0.36, 1, f));
      lineFade(flowLines, sub(O, 0.74, 0.92));
      lineFade(wallLines, sub(O, 0.6, 0.8));
      lineFade(paveLines, sub(O, 0.62, 0.84));
      railLines.scale.y = Math.max(1e-3, sub(O, 0.62, 0.82, ease.out));
      railLines.visible = O > 0.62;
      stones.forEach((g, i) => {
        const s = sub(O, 0.64 + (i % 7) * 0.012, 0.82 + (i % 7) * 0.012, ease.out);
        g.scale.y = Math.max(1e-3, s);
        g.visible = s > 0.001;
      });
      people.forEach((g, i) => {
        const s = sub(O, 0.8 + i * 0.02, 0.94 + i * 0.02, ease.out);
        g.scale.setScalar(Math.max(1e-3, s));
        g.visible = s > 0.001;
      });
      trees.forEach((g, i) => {
        const s = sub(O, 0.66 + i * 0.03, 0.88 + i * 0.03, ease.out);
        g.scale.setScalar(Math.max(1e-3, s * g.userData.sc));
        g.visible = s > 0.001;
      });
      lineFade(grassLines, sub(O, 0.66, 0.86));
      lineFade(reeds, sub(O, 0.72, 0.94));
    }
    S.anim.prop('build', 0, v => { B = v; refresh(); }, { kind: 'reveal', dur: 2400 });
    S.anim.prop('open', 0, v => { O = v; refresh(); }, { kind: 'reveal', dur: 3200 });

    // ================= labels: one column at the right, horizontal leaders =================
    const COL = 692;
    const lHwy = S.label({
      text: 'Elevated highway', anchor: new THREE.Vector3(XB - 0.6, (Y_DECK0 + Y_DECK1) / 2, ZC), anchorObj: hwy,
      place: { mode: 'column', x: COL },
    });
    const lBur = S.label({
      text: 'Stream buried underneath', anchor: new THREE.Vector3(XB - 0.6, (Y_BED + Y_CWATER) / 2, ZC), anchorObj: buried,
      place: { mode: 'column', x: COL }, leaderTone: 'blue', nowrap: false, maxWidth: 200,
    });
    const lOpen = S.label({
      text: 'Stream opened up', anchor: new THREE.Vector3(XB - 0.6, (Y_BED + Y_WATER) / 2, ZC), anchorObj: stream,
      place: { mode: 'column', x: COL }, leaderTone: 'blue',
    });
    const zb = -10.6;
    const lBank = S.label({
      text: 'Planted banks and walkways', anchor: new THREE.Vector3(XB - 0.3, slopeY(zb), zb), anchorObj: banks,
      place: { mode: 'column', x: COL }, nowrap: false, maxWidth: 200,
    });
    labelProp(S, 'Lhwy', lHwy);
    labelProp(S, 'Lbur', lBur);
    labelProp(S, 'Lopen', lOpen);
    labelProp(S, 'Lbank', lBank);

    return {
      targets: n => ({
        build: n >= 1 ? 1 : 0, open: n >= 2 ? 1 : 0,
        Lhwy: n === 1 ? 1 : 0, Lbur: n === 1 ? 1 : 0, Lopen: n === 2 ? 1 : 0, Lbank: n === 2 ? 1 : 0,
      }),
      plan(name, from, to, dir, n, prev) {
        const fwd = dir > 0;
        const lin = ease.linear;
        if (name === 'build') return fwd ? { delay: 0, dur: 2400, ease: lin } : { delay: prev === 2 ? 1500 : 0, dur: 1300, ease: lin };
        if (name === 'open') return fwd ? { delay: prev === 0 ? 2300 : 0, dur: 3200, ease: lin } : { delay: 200, dur: 1900, ease: lin };
        if (to < from) return { delay: 0, dur: 320 };                        // labels leave first
        const base = fwd ? (prev === 0 && n === 2 ? 2300 : 0) : 2100;       // after the parts settle
        if (name === 'Lhwy') return { delay: fwd ? 2150 : base + 50, dur: 520 };
        if (name === 'Lbur') return { delay: fwd ? 2300 : base + 200, dur: 520 };
        if (name === 'Lopen') return { delay: base + 3150, dur: 520 };
        if (name === 'Lbank') return { delay: base + 3300, dur: 520 };
        return null;
      },
    };
  },
});
