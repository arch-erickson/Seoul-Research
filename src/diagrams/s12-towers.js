// s12-towers: Amorepacific HQ (left) and Lotte World Tower (right), each a white study model at its own scale.
// Facts (brief §3 / dossier §6.4 and §6.5):
//  Amorepacific (David Chipperfield + Arup, 2017): a near-cube organised around a central courtyard; three large
//  openings cut through the facade at different heights connect the courtyard to the outside; vertical fins
//  against solar gain and glare; about 22 floors, 7,000 to 8,000 workers. The passive strategy (air through the
//  courtyard) is the focal information -> blue airflow path.
//  Lotte World Tower (KPF, 2017): 555 m, 123 floors, smooth tapering form with a slim crown; 720 geothermal wells
//  about 200 m deep; Han River water for heating and cooling; vertical-axis wind turbines near the top; solar
//  panels. The equipment is the focal information -> one red system.
// The two buildings are deliberately drawn at different scales (no relative scale implied, no scale bar).
// States: 0 empty · 1 Amorepacific builds · 2 Lotte World Tower builds beside it.
import {
  defineDiagram, THREE, C, LW, ease, sub, lerp, labelProp,
} from '../kit3d/index.js';

const DEG = Math.PI / 180;
const AZ = 35, EL = 30;
const KA = 2.3;                 // px per metre, Amorepacific
const KL = 0.52;                // px per metre, Lotte World Tower
const A_AT = [188, 312];        // screen px of the Amorepacific base centre (= view target)
const L_AT = [972, 276];        // screen px of the Lotte ground centre
// camera basis on the ground plane
const RIGHT = new THREE.Vector3(Math.cos(AZ * DEG), 0, -Math.sin(AZ * DEG));
const FRONT = new THREE.Vector3(Math.sin(AZ * DEG), 0, Math.cos(AZ * DEG));
const VIEW = new THREE.Vector3(Math.cos(EL * DEG) * Math.sin(AZ * DEG), Math.sin(EL * DEG), Math.cos(EL * DEG) * Math.cos(AZ * DEG));

// ---------------- Amorepacific (metres) ----------------
const AH = 50;                  // half side of the near-cube
const AHT = 105;                // height
const FLH = AHT / 22;           // about 22 floors
const CC = 22;                  // courtyard half width
const OW = 18;                  // opening half width
const O1 = [4 * FLH, 9 * FLH];  // levels 5-9, front-left face (+z)
const O2 = [10 * FLH, 15 * FLH];// levels 11-15, front-right face (+x)
const O3 = [16 * FLH, 21 * FLH];// levels 17-21, back face (-z), seen through the courtyard
const CY = O1[0];               // courtyard floor (level 5)

// ---------------- Lotte World Tower (metres, own scale) ----------------
const LH = 555;
const LB0 = 36;                 // base half width
const LBT = 9;                  // crown-top half width
const LSE = 5;                  // superellipse exponent (rounded square plan)
const BLK = 80;                 // half side of the site plate
const PLATE_T = 6;              // site plate thickness
const WELL_D = 200;             // about 200 m deep
const PV = [372, 408];          // solar band
const TURB = [503, 540];        // turbines near the top
const lw = y => LBT + (LB0 - LBT) * (1 - Math.pow(Math.max(0, y) / LH, 1.7));

// ---------- geometry helpers ----------
function voxelGeometry(xs, ys, zs, filled) {
  const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const F = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && filled(i, j, k);
  const pos = [];
  const quad = (a, b, c, d, n) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const t = b; b = d; d = t; }
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!F(i, j, k)) continue;
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1], z0 = zs[k], z1 = zs[k + 1];
    if (!F(i + 1, j, k)) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    if (!F(i - 1, j, k)) quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    if (!F(i, j + 1, k)) quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    if (!F(i, j - 1, k)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    if (!F(i, j, k + 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (!F(i, j, k - 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// rounded-square (superellipse) ring of half width a
function ring(a, n = 72, grow = 0) {
  const out = [];
  const e = 2 / LSE;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    out.push([(a + grow) * Math.sign(c) * Math.pow(Math.abs(c), e), (a + grow) * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  return out;
}

// smooth multi-ring loft with flat caps; rings: [{ y, a }] bottom→top
function loftRings(rings, grow = 0, n = 72) {
  const pos = [];
  const R = rings.map(r => ring(r.a, n, grow).map(([x, z]) => [x, r.y, z]));
  for (let j = 0; j < R.length - 1; j++) {
    const A = R[j], B = R[j + 1];
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      // outward winding: (A[i], A[i1], B[i1]) is CCW seen from outside for increasing t (counter-clockwise in x,z)
      pos.push(...A[i], ...B[i1], ...A[i1], ...A[i], ...B[i], ...B[i1]);
    }
  }
  const top = R[R.length - 1], bot = R[0];
  const ct = [0, rings[rings.length - 1].y, 0], cb = [0, rings[0].y, 0];
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    pos.push(...ct, ...top[i1], ...top[i]);
    pos.push(...cb, ...bot[i], ...bot[i1]);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // fix winding if the guess above was wrong: test one side triangle against its outward direction
  const p = g.attributes.position.array;
  const a = new THREE.Vector3(p[0], p[1], p[2]), b = new THREE.Vector3(p[3], p[4], p[5]), c = new THREE.Vector3(p[6], p[7], p[8]);
  const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  const out = new THREE.Vector3(a.x + b.x + c.x, 0, a.z + b.z + c.z);
  if (nrm.dot(out) < 0) {
    for (let t = 0; t < p.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = tmp; }
  }
  g.computeVertexNormals();
  return g;
}

function curvePoints(pts, n) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  return { curve, pts: curve.getSpacedPoints(n) };
}
function polySeg(pts) {
  const s = [];
  for (let i = 0; i < pts.length - 1; i++) s.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  return s;
}

export default defineDiagram({
  id: 's12-towers',
  states: 2,
  region: { x: 100, y: 412, w: 1720, h: 420 },
  stage: {
    view: { azimuth: AZ, elevation: EL, target: [0, 0, 0], scale: KA, at: A_AT },
    shadowBox: { min: [-70, -50, -260], max: [300, 140, 70] },
    ground: false,
  },
  build(S) {
    // small previews (presenter view, thumbnails): fewer hairlines, heavier focal lines so the blue/red still read
    const PREV = S.quality === 'preview';
    const W = (full, prev) => (PREV ? prev : full);

    // ================= AMOREPACIFIC =================
    const apPart = S.part('Amorepacific');
    const apG = new THREE.Group();
    apPart.add(apG);
    const xs = [-AH, -CC, -OW, OW, CC, AH];
    const ys = [0, O1[0], O1[1], O2[0], O2[1], O3[0], O3[1], AHT];
    const inR = (v, r) => v > r[0] && v < r[1];
    const apGeo = voxelGeometry(xs, ys, xs, (i, j, k) => {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2, cz = (xs[k] + xs[k + 1]) / 2;
      if (Math.abs(cx) < CC && Math.abs(cz) < CC && cy > CY) return false;       // central courtyard
      if (Math.abs(cx) < OW && cz > CC && inR(cy, O1)) return false;              // opening 1
      if (Math.abs(cz) < OW && cx > CC && inR(cy, O2)) return false;              // opening 2
      if (Math.abs(cx) < OW && cz < -CC && inR(cy, O3)) return false;             // opening 3
      return true;
    });
    S.solid(apGeo, { creaseAngle: 20 }, apG);

    // vertical sun-shading fins: hairlines on the facades, broken at the openings
    const FIN = W(3.8, 7.6);
    const fins = [];
    const finRun = (u, cut) => (Math.abs(u) < OW - 0.01 && cut ? [[0, cut[0]], [cut[1], AHT]] : [[0, AHT]]);
    const o = 0.06;
    for (let u = -AH + FIN / 2; u < AH; u += FIN) {
      for (const [y0, y1] of finRun(u, O1)) fins.push(u, y0, AH + o, u, y1, AH + o);           // +z face
      for (const [y0, y1] of finRun(-u, O2)) fins.push(AH + o, y0, -u, AH + o, y1, -u);       // +x face
    }
    // courtyard faces seen from above (far walls): the -z wing (faces +z) and the -x wing (faces +x)
    for (let u = -CC + FIN / 2; u < CC; u += FIN) {
      const runs = Math.abs(u) < OW - 0.01 ? [[CY, O3[0]], [O3[1], AHT]] : [[CY, AHT]];
      for (const [y0, y1] of runs) fins.push(u, y0, -CC + o, u, y1, -CC + o);
      fins.push(-CC + o, CY, u, -CC + o, AHT, u);
    }
    const finWipe = new THREE.Plane(RIGHT.clone().negate(), 0);
    const finLines = S.lines(fins, { width: LW.hair, color: C.hair, clippingPlanes: [finWipe] }, apG);

    // airflow: in through the low opening, up through the courtyard and out above the roof
    const airPart = S.part('Airflow');
    const AIR_N = 220;
    const { curve: airCurve, pts: airPts } = curvePoints([
      [-2, 27, 78], [-1, 28, 52], [0, 30, 30], [0, 37, 9], [0, 58, 0], [0, 94, 0], [0, 128, 0],
    ], AIR_N);
    const airSolid = S.lines(polySeg(airPts), { width: W(2.8, 6), color: C.blue }, airPart);
    const airHidden = S.lines(polySeg(airPts), { width: W(1.4, 4), color: C.blue, dashed: true, dashSize: W(5, 12), gapSize: W(4, 9), depthTest: false }, airPart);
    airHidden.material.depthWrite = false;
    airHidden.renderOrder = 10;
    // arrowhead: a flat triangle in the plane of the path, facing the camera
    const AH_L = 9.5, AH_W = 4.2;
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, AH_L, 0, -AH_W, 0, 0, AH_W, 0, 0], 3));
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: C.blue, side: THREE.DoubleSide, toneMapped: false }));
    head.renderOrder = 11;
    head.material.depthTest = false;
    airPart.add(head);
    const _t = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
    function setAir(s) {
      airPart.visible = s > 0.002;
      const n = Math.max(1, Math.round(s * AIR_N));
      airSolid.geometry.instanceCount = n;
      airHidden.geometry.instanceCount = n;
      const u = Math.min(1, n / AIR_N);
      const p = airCurve.getPointAt(u);
      airCurve.getTangentAt(u, _t).normalize();
      _x.crossVectors(_t, VIEW).normalize();
      _z.crossVectors(_x, _t).normalize();
      _m.makeBasis(_x, _t, _z);
      head.quaternion.setFromRotationMatrix(_m);
      head.position.copy(p).addScaledVector(_t, -AH_L * 0.35);
      head.visible = s > 0.04;
    }

    S.anim.prop('ap', 0, v => {
      const rise = sub(v, 0, 0.36, ease.out);
      apPart.visible = v > 0.001;
      apG.scale.y = Math.max(1e-4, rise);
      // fins sweep in from left to right across both faces
      const f = sub(v, 0.3, 0.64, ease.inOut);
      finWipe.constant = lerp(-80, 80, f);
      finLines.visible = f > 0.001;
      setAir(sub(v, 0.5, 1, ease.inOut));
    }, { kind: 'reveal', dur: 3000 });

    // ================= LOTTE WORLD TOWER =================
    const lotte = new THREE.Group();
    const fL = KL / KA;
    lotte.scale.setScalar(fL);
    lotte.rotation.y = -10 * DEG;      // its own orientation: the site plate reads symmetrically (45° view)
    lotte.position.copy(RIGHT).multiplyScalar((L_AT[0] - A_AT[0]) / KA)
      .addScaledVector(FRONT, (L_AT[1] - A_AT[1]) / (KA * Math.sin(EL * DEG)));
    S.world.add(lotte);

    // ground: a thin site plate; the well field hangs below it
    const groundPart = S.part('Lotte ground', lotte);
    const groundG = new THREE.Group();
    groundPart.add(groundG);
    const white = S.material(C.model);
    S.solid(new THREE.BoxGeometry(2 * BLK, PLATE_T, 2 * BLK).translate(0, -PLATE_T / 2, 0), { material: white }, groundG);

    const wellsPart = S.part('Geothermal wells', lotte);
    const WELL_N = 8, WELL_STEP = (2 * BLK) / WELL_N;
    const wellXZ = [];
    for (let i = 0; i < WELL_N; i++) for (let j = 0; j < WELL_N; j++) wellXZ.push([-BLK + WELL_STEP * (i + 0.5), -BLK + WELL_STEP * (j + 0.5)]);
    // sweep left to right on screen (local x - z)
    const wellOrder = wellXZ.map(([x, z]) => (x - z + 2 * BLK) / (4 * BLK));
    const wellLines = S.lines([], { width: W(0.9, 2.4), color: C.red }, wellsPart);
    function setWells(s) {
      wellsPart.visible = s > 0.001;
      const seg = [];
      wellXZ.forEach(([x, z], i) => {
        const o = wellOrder[i] * 0.45;
        const k = sub(s, o, o + 0.55, ease.inOut);
        if (k <= 0.001) return;
        seg.push(x, -PLATE_T, z, x, -PLATE_T - (WELL_D - PLATE_T) * k, z);
      });
      wellLines.geometry.setPositions(seg.length ? seg : [0, 0, 0, 0, 0, 0]);
      wellLines.geometry.instanceCount = Math.max(1, seg.length / 6);
      wellLines.visible = seg.length > 0;
    }

    // tower
    const towerPart = S.part('Lotte World Tower', lotte);
    const towerG = new THREE.Group();
    towerPart.add(towerG);
    const tRings = [];
    for (let i = 0; i <= 36; i++) { const y = LH * i / 36; tRings.push({ y, a: lw(y) }); }
    S.solid(loftRings(tRings, 0, 96), { creaseAngle: 30 }, towerG);
    // the vertical seam at the centre of each face (hairline), on the two faces seen
    const seam = [];
    for (let i = 0; i < 40; i++) {
      const y0 = LH * i / 40, y1 = LH * (i + 1) / 40;
      seam.push(0, y0, lw(y0) + 0.25, 0, y1, lw(y1) + 0.25);
      seam.push(lw(y0) + 0.25, y0, 0, lw(y1) + 0.25, y1, 0);
    }
    S.lines(seam, { width: LW.hair, color: C.hair }, towerG);

    // solar band (red)
    const pvPart = S.part('Solar panels', lotte);
    const pvG = new THREE.Group();
    pvPart.add(pvG);
    const pvRings = [];
    for (let i = 0; i <= 4; i++) { const y = PV[0] + (PV[1] - PV[0]) * i / 4; pvRings.push({ y, a: lw(y) }); }
    const pvMat = S.material(C.red, { roughness: 0.8 });
    const pvEdges = { color: C.redDeep, color2: C.redDeep, width: 1.2, width2: 0.6 };
    S.solid(loftRings(pvRings, 1.2, 96), { material: pvMat, edges: pvEdges, castShadow: false, creaseAngle: 30 }, pvG);
    pvG.position.y = (PV[0] + PV[1]) / 2;
    pvG.children[0].position.y = -(PV[0] + PV[1]) / 2;

    // vertical-axis wind turbines near the top (red): a ring of vertical blades standing off the crown
    const turbPart = S.part('Wind turbines', lotte);
    const turbG = new THREE.Group();
    turbPart.add(turbG);
    const TB = 10, TOFF = 3.2;
    const tSeg = [];
    const ringAt = (y, n) => ring(lw(y), n, TOFF).map(([x, z]) => [x, y, z]);
    const tb = ringAt(TURB[0], TB), tt = ringAt(TURB[1], TB);
    for (let i = 0; i < TB; i++) tSeg.push(...tb[i], ...tt[i]);
    for (const y of [TURB[0], TURB[1]]) {
      const r = ringAt(y, 64);
      for (let i = 0; i < r.length; i++) tSeg.push(...r[i], ...r[(i + 1) % r.length]);
    }
    S.lines(tSeg, { width: W(1.1, 3), color: C.red }, turbG);
    turbG.position.y = (TURB[0] + TURB[1]) / 2;
    turbG.children[0].position.y = -(TURB[0] + TURB[1]) / 2;

    // Han River water pipe (red): from the tower base across the site plate and off toward the river
    const pipePart = S.part('River water pipe', lotte);
    const PIPE_N = 40;
    const pipeA = new THREE.Vector3(26, 1.2, -26), pipeB = new THREE.Vector3(BLK + 26, 1.2, -BLK - 26);
    const pipePts = [];
    for (let i = 0; i <= PIPE_N; i++) pipePts.push(new THREE.Vector3().lerpVectors(pipeA, pipeB, i / PIPE_N));
    const pipe = S.lines(polySeg(pipePts), { width: W(2.6, 6), color: C.red }, pipePart);

    S.anim.prop('lt', 0, v => {
      lotte.visible = v > 0.001;
      const g = sub(v, 0, 0.2, ease.out);
      groundG.scale.set(Math.max(1e-4, g), 1, Math.max(1e-4, g));
      const t = sub(v, 0.12, 0.5, ease.out);
      towerG.scale.y = Math.max(1e-4, t);
      towerPart.visible = t > 0.001;
      setWells(sub(v, 0.36, 0.72));
      const p = sub(v, 0.56, 0.76, ease.inOut);
      pipe.geometry.instanceCount = Math.max(1, Math.round(p * PIPE_N));
      pipePart.visible = p > 0.01;
      const b = sub(v, 0.66, 0.86, ease.out);
      pvG.scale.y = Math.max(1e-4, b);
      pvPart.visible = b > 0.001;
      const tu = sub(v, 0.78, 0.98, ease.out);
      turbG.scale.y = Math.max(1e-4, tu);
      turbPart.visible = tu > 0.001;
    }, { kind: 'reveal', dur: 3200 });

    // ================= labels =================
    const COL_A = 400, COL_L = 1078;
    const wpL = (x, y, z) => () => lotte.localToWorld(new THREE.Vector3(x, y, z));
    const corner = a => 0.871 * a;        // the superellipse's 45° point
    const L = {
      court: S.label({ text: 'Central courtyard', anchor: new THREE.Vector3(CC - 1.2, AHT - 1.2, -CC + 0.1), anchorObj: apPart, place: { mode: 'column', x: COL_A } }),
      open: S.label({ text: 'Three large openings', anchor: new THREE.Vector3(AH, (O2[0] + O2[1]) / 2, -OW + 0.6), anchorObj: apPart, place: { mode: 'column', x: COL_A } }),
      fins: S.label({ text: 'Sun-shading fins', anchor: new THREE.Vector3(AH + 0.1, 78, -40), anchorObj: apPart, place: { mode: 'column', x: COL_A } }),
      floors: S.label({ text: 'About 22 floors · 7,000 to 8,000 workers', anchor: new THREE.Vector3(AH + 0.1, 14, -AH + 1.5), anchorObj: apPart, place: { mode: 'column', x: COL_A } }),
      turb: S.label({ text: 'Wind turbines near the top', anchor: wpL(corner(lw(522) + TOFF), 522, -corner(lw(522) + TOFF)), anchorObj: turbPart, place: { mode: 'column', x: COL_L }, leaderTone: 'red' }),
      pv: S.label({ text: 'Solar panels', anchor: wpL(corner(lw(390)) + 1, 390, -corner(lw(390)) - 1), anchorObj: pvPart, place: { mode: 'column', x: COL_L }, leaderTone: 'red' }),
      height: S.label({ text: '555 m · 123 floors', anchor: wpL(corner(lw(250)) - 0.5, 250, -corner(lw(250)) + 0.5), anchorObj: towerPart, place: { mode: 'column', x: COL_L } }),
      river: S.label({ text: 'Han River water for heating and cooling', anchor: () => lotte.localToWorld(pipeB.clone()), anchorObj: pipePart, place: { mode: 'column', x: COL_L }, leaderTone: 'red' }),
      wells: S.label({ text: '720 geothermal wells, about 200 m deep', anchor: wpL(BLK - BLK / 8, -118, -BLK + BLK / 8), anchorObj: wellsPart, place: { mode: 'column', x: COL_L }, leaderTone: 'red' }),
    };
    for (const k of Object.keys(L)) labelProp(S, 'L_' + k, L[k]);

    const AP_L = ['court', 'open', 'fins', 'floors'];
    const LT_L = ['height', 'wells', 'river', 'pv', 'turb'];
    const DELAY = {
      L_court: 1250, L_open: 1340, L_fins: 2050, L_floors: 1430,
      L_height: 1700, L_wells: 2450, L_river: 2600, L_pv: 2900, L_turb: 3350,
    };
    return {
      targets(n) {
        const out = { ap: n >= 1 ? 1 : 0, lt: n >= 2 ? 1 : 0 };
        for (const k of AP_L) out['L_' + k] = n >= 1 ? 1 : 0;
        for (const k of LT_L) out['L_' + k] = n >= 2 ? 1 : 0;
        return out;
      },
      plan(name, from, to, dir) {
        if (name === 'ap' || name === 'lt') return dir > 0 ? { delay: 0, ease: ease.linear } : { delay: 120, dur: 800, ease: ease.linear };
        if (dir > 0 && DELAY[name] != null) return { delay: DELAY[name] };
        return null;
      },
    };
  },
});
