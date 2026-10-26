// s06-reactor: One Less Nuclear Power Plant (OLNPP Phase 1).
// State 1: a Korean nuclear plant as a white study model, close and centred: containment (cylinder + hemispherical
// dome), auxiliary building, long turbine hall with its lower side annex. Coastal and seawater-cooled, so NO cooling
// tower. The plinth unfolds, then each volume rises out of it whole (clipped at the plinth top, no squashing).
// State 2: the camera pulls back and left; a slanted cut sweeps the plant from right to left and every piece it passes
// becomes a tiny dwelling that flies right and settles into a 10 x 10 mosaic of blocks (16 dwellings each, 1,600 in
// all): 79 blocks red (efficiency), 21 grey (renewables). The plant stays behind as a dashed outline: the plant Seoul
// did not need. Going back replays the same motion in reverse.
import { defineDiagram, THREE, C, LW, ease, sub, lerp, labelProp, boxGeo, rng, edgeLinesFromGeometry } from '../kit3d/index.js';

const DEG = Math.PI / 180;
const AZ = 55, EL = 28;
const az = AZ * DEG, el = EL * DEG;
const RG = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));                                   // screen-right on the ground
const VIEW = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)); // toward the camera
const UPV = new THREE.Vector3().crossVectors(VIEW, RG).normalize();                             // screen-up

// ---- plant (m) ----
const Y0 = 1.5;                       // plinth top
const RC = 22, HC = 40;               // containment radius, wall height (dome on top)
const AUX = { x0: -20, x1: 20, z0: 12, z1: 44, h: 26 };
const TURB = { x0: -20, x1: 20, z0: 44, z1: 128, h: 34 };
const ANNEX = { x0: 20, x1: 28, z0: 44, z1: 128, h: 14 };
const PLINTH = { x0: -32, x1: 36, z0: -29, z1: 136 };

// ---- mosaic of dwellings: 10 x 10 blocks, 4 x 4 dwellings per block ----
const NB = 10, NH = 4;
const PITCH = 2.3, STREET = 3.2;
const BLK = NH * PITCH, CELL = BLK + STREET;
const FW = NB * BLK + (NB - 1) * STREET;           // 120.8 m
const N = NB * NB * NH * NH;                        // 1,600 dwellings
const RED_BLOCKS = 79;                              // efficiency 79% · renewables 21%
const FIELD_D = 156;                                // field centre, along screen-right from the plant
const FC = RG.clone().multiplyScalar(FIELD_D);
const FY = 1.2;                                     // field plinth top
const FPAD = 3;
const GREY = '#C3C2BE';
const GREY_EDGE = '#94959A';

// ---- camera: state 1 is a close, centred hero; beat 2 pulls back and left to make room for the mosaic ----
const S1 = 3.4, AT1 = [530, 227];
const S2 = 2.7, AT2 = [384, 262];

// ---- beat timing (ms, before the kit's global MOTION.timeScale, 1.35 at the time of writing) ----
const T1 = 1300;                       // build the plant
const T2 = 3300;                       // dissolve, fly, settle
const CAM = [0, 900];                  // camera pull-back (ease-in-out)
const SHF = [60, 600];                 // shadows fade out (ease-in-out)
const FPL = [450, 1000];               // field plinth unfolds from its near corner
const WIPE = [650, 2050];              // slanted cut sweeps the plant
const FLY = 850, FLY_J = 60, POP = 170;
const OUT_DUR = 300;
const L1B_DELAY = 2150;                // ghost label, once the cut has passed
const L2_DELAY = 3300;                 // households label, once the last row and its outlines have settled
const BACK2 = 2400;                    // rewind of beat 2 (slow enough for a calm camera push-in)

function houseGeo() {
  const w = 1.6, d = 1.8, h = 0.9, r = 1.5;
  const s = new THREE.Shape([
    new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h),
    new THREE.Vector2(0, r), new THREE.Vector2(-w / 2, h),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return g;
}

// containment = lathe of the wall + hemispherical dome (smooth junction: only its silhouette is inked)
function containmentGeo() {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(RC, 0), new THREE.Vector2(RC, HC)];
  const n = 24;
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI / 2;
    pts.push(new THREE.Vector2(i === n ? 0 : RC * Math.cos(a), HC + RC * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, 120);
  g.computeVertexNormals();
  return g;
}

const boxAt = (b, h = b.h) => boxGeo(b.x1 - b.x0, h, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);

// visible edges of an axis-aligned box seen from the (+x, +y, +z) side (for the dashed outline)
function boxPhantom(b, y0, y1) {
  const { x0, x1, z0, z1 } = b;
  const s = [];
  const L = (p, q) => s.push(p[0], p[1], p[2], q[0], q[1], q[2]);
  L([x0, y1, z0], [x1, y1, z0]); L([x1, y1, z0], [x1, y1, z1]); L([x1, y1, z1], [x0, y1, z1]); L([x0, y1, z1], [x0, y1, z0]);
  L([x1, y0, z0], [x1, y1, z0]); L([x1, y0, z1], [x1, y1, z1]); L([x0, y0, z1], [x0, y1, z1]);
  L([x1, y0, z0], [x1, y0, z1]); L([x1, y0, z1], [x0, y0, z1]);
  return s;
}

// deterministic two-line labels: the label keeps its exact text, the break sits where it reads best
function breakLines(label, lines) {
  label.nameEl.textContent = '';
  lines.forEach((t, i) => {
    if (i) label.nameEl.appendChild(document.createElement('br'));
    label.nameEl.appendChild(document.createTextNode(t));
  });
  label.measure();
}

function polySeg(pts, out) {
  for (let i = 0; i < pts.length - 1; i++) out.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  return out;
}

function inkUnder(obj) {
  const out = [];
  obj.traverse(o => { if (o.isInkLines) out.push(o); });
  return out;
}

export default defineDiagram({
  id: 's06-reactor',
  states: 2,
  region: { x: 100, y: 420, w: 1080, h: 420 },
  stage: {
    view: { azimuth: AZ, elevation: EL, target: [0, 0, 0], scale: S1, at: AT1.slice() },
    shadowBox: { min: [-36, 0, -196], max: [158, 66, 140] },
    ground: { opacity: 0.06 },            // the containment shadow falls past the plinth: keep it as faint as on the plinth
  },
  build(S) {
    S.view.at = S.view.at.slice();          // the stage copies view shallowly: give this instance its own array
    const SH0 = S.key.shadow.intensity;
    const plant = S.part('Nuclear plant');

    // ---------- the slanted cut that turns the plant into dwellings ----------
    const NS = RG.clone().add(new THREE.Vector3(0, 0.75, 0)).normalize();
    const Cd = new THREE.Vector3(0, Y0 + HC, 0);
    const probe = [Cd.clone().addScaledVector(NS, RC)];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      probe.push(new THREE.Vector3(RC * Math.cos(a), Y0, RC * Math.sin(a)));
    }
    for (const b of [AUX, TURB, ANNEX]) for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [Y0, Y0 + b.h]) probe.push(new THREE.Vector3(x, y, z));
    const dMax = Math.max(...probe.map(p => NS.dot(p))) + 0.6;
    const dMin = Math.min(...probe.map(p => NS.dot(p))) - 0.6;
    const clipSolid = new THREE.Plane(NS.clone().negate(), 1e4);   // keeps NS·p <= c
    const clipGhost = new THREE.Plane(NS.clone(), -1e4);            // keeps NS·p >= c
    const cutAt = (p2ms) => lerp(dMax, dMin, sub(p2ms, WIPE[0], WIPE[1]));
    const releaseMs = (p) => lerp(WIPE[0], WIPE[1], (dMax - NS.dot(p)) / (dMax - dMin));

    // ---------- plinth (unfolds from its centre) ----------
    const plinth = new THREE.Group();
    plinth.position.set((PLINTH.x0 + PLINTH.x1) / 2, 0, (PLINTH.z0 + PLINTH.z1) / 2);
    plant.add(plinth);
    S.solid(boxGeo(PLINTH.x1 - PLINTH.x0, Y0, PLINTH.z1 - PLINTH.z0), {}, plinth);
    const plinthInk = inkUnder(plinth);
    // footprint slots: a contact line where each volume meets the plinth, so a rising volume never floats as a white
    // bubble on white (in state 1 they sit exactly under the silhouette bottom edges; the cut removes them with the
    // plant). World space, so they always match the volumes; trimmed to the plinth while it unfolds.
    const PCX = (PLINTH.x0 + PLINTH.x1) / 2, PCZ = (PLINTH.z0 + PLINTH.z1) / 2;
    const PHX = (PLINTH.x1 - PLINTH.x0) / 2, PHZ = (PLINTH.z1 - PLINTH.z0) / 2;
    const clipPl = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
                    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
    const ringPts = [];
    for (let i = 0; i <= 96; i++) { const a = i / 96 * 2 * Math.PI; ringPts.push(new THREE.Vector3(RC * Math.cos(a), Y0 + 0.03, RC * Math.sin(a))); }
    const rect = b => [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1], [b.x0, b.z0]].map(([x, z]) => new THREE.Vector3(x, Y0 + 0.03, z));
    const fp = [ringPts, rect(AUX), rect(TURB), rect(ANNEX)].map(pts =>
      S.lines(polySeg(pts, []), { width: LW.crease, color: C.edge, clippingPlanes: [clipSolid, ...clipPl] }, plant));

    // ---------- buildings ----------
    // clipBase keeps everything above the plinth top, so in beat 1 each volume rises out of the plinth whole
    // (the dome keeps its true shape instead of being squashed by a scale)
    const clipBase = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(Y0 - 0.02));
    const CLIP = [clipSolid, clipBase];
    // outside faces white; the inside faces carry the section tone, so the cut reads as a cut, not a melt. The inside
    // gets a larger polygon offset: where two volumes touch (turbine/aux at z 44, annex/turbine at x 20) the outside
    // face must win.
    const mat = S.material(C.model, { unique: true, clippingPlanes: CLIP });
    mat.shadowSide = THREE.DoubleSide;     // same shadow map as before (clipping is not applied to the shadow pass)
    const backMat = S.material(C.modelCut, { unique: true, clippingPlanes: CLIP, side: THREE.BackSide, offsetFactor: 2, offsetUnits: 4 });
    const eClip = { clippingPlanes: CLIP };
    const solids = new THREE.Group();
    plant.add(solids);
    const mk = (geo) => {
      const g = new THREE.Group();
      g.position.y = Y0;
      solids.add(g);
      S.solid(geo, { material: mat, edges: eClip }, g);
      const bm = new THREE.Mesh(geo, backMat);
      bm.castShadow = false; bm.receiveShadow = false;
      g.add(bm);
      return g;
    };
    const gCont = mk(containmentGeo());
    const gAux = mk(boxAt(AUX));
    const gTurb = mk(boxAt(TURB));
    const gAnnex = mk(boxAt(ANNEX));

    // hairline detail: springline of the dome, aux roof meeting the containment, turbine hall bays
    const hair = { width: LW.hair, color: C.hair, clippingPlanes: CLIP };
    const vh = new THREE.Vector3(VIEW.x, 0, VIEW.z).normalize();
    const phiV = Math.atan2(vh.z, vh.x);
    const ring = [];
    for (let i = 0; i <= 64; i++) {
      const a = phiV - Math.PI / 2 + (i / 64) * Math.PI;
      ring.push(new THREE.Vector3(RC * Math.cos(a), HC, RC * Math.sin(a)));
    }
    S.lines(polySeg(ring, []), hair, gCont);
    const arc = [];
    const xa = Math.sqrt(RC * RC - AUX.z0 * AUX.z0);
    for (let i = 0; i <= 32; i++) {
      const x = -xa + (2 * xa * i) / 32;
      arc.push(new THREE.Vector3(x, AUX.h + 0.02, Math.sqrt(Math.max(0, RC * RC - x * x))));
    }
    S.lines(polySeg(arc, []), { width: LW.crease, color: C.crease, clippingPlanes: CLIP }, gAux);
    const bays = [];
    for (let k = 1; k < 8; k++) {
      const z = TURB.z0 + (k * (TURB.z1 - TURB.z0)) / 8;
      bays.push(TURB.x1 + 0.02, ANNEX.h, z, TURB.x1 + 0.02, TURB.h, z);
    }
    S.lines(bays, hair, gTurb);
    const volumes = [[gCont, HC + RC], [gAux, AUX.h], [gTurb, TURB.h], [gAnnex, ANNEX.h]].map(([g, h]) => ({ g, h: h + 0.5 }));

    // ---------- section line: the ink outline of the cut, on the cut plane, for the union of the volumes ----------
    // (the plane faces the camera and everything kept lies behind it, so the whole outline is visible)
    const SEC_MAX = 4000;                                     // segment capacity, written in place (no per-frame buffers)
    const secBuf = new Float32Array(SEC_MAX * 6);
    const sec = S.lines(secBuf, { width: LW.silhouette, color: C.edge }, plant);
    sec.frustumCulled = false;
    sec.visible = false;
    const E1 = new THREE.Vector3().crossVectors(NS, new THREE.Vector3(0, 1, 0)).normalize();
    const E2 = new THREE.Vector3().crossVectors(NS, E1);
    const BOXES = [AUX, TURB, ANNEX];
    const EPS = 1e-4;
    const inBox = (b, x, y, z) => x > b.x0 + EPS && x < b.x1 - EPS && z > b.z0 + EPS && z < b.z1 - EPS && y > Y0 + EPS && y < Y0 + b.h - EPS;
    const inCont = (x, y, z) => y > Y0 + EPS && (y <= Y0 + HC
      ? x * x + z * z < RC * RC - EPS
      : x * x + (y - Y0 - HC) * (y - Y0 - HC) + z * z < RC * RC - EPS);
    const inAny = (x, y, z) => inCont(x, y, z) || BOXES.some(b => inBox(b, x, y, z));
    const boxCorners = BOXES.map(b => {
      const v = [];
      for (const x of [b.x0, b.x1]) for (const y of [Y0, Y0 + b.h]) for (const z of [b.z0, b.z1]) v.push(new THREE.Vector3(x, y, z));
      return v;
    });
    const boxEdges = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const x = i ^ j; if (x === 1 || x === 2 || x === 4) boxEdges.push([i, j]); }
    const segs = [];
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _n = new THREE.Vector3();
    function addSeg(p, q) {            // keep only the pieces of p-q that lie on the outline of the union
      const len = p.distanceTo(q);
      if (len < 1e-6) return;
      const n = Math.max(1, Math.ceil(len / 1.2));
      _n.subVectors(q, p).normalize();
      _n.crossVectors(NS, _n).multiplyScalar(0.08);   // across the outline, inside the cut plane
      for (let i = 0; i < n; i++) {
        _a.lerpVectors(p, q, i / n); _b.lerpVectors(p, q, (i + 1) / n);
        _m.addVectors(_a, _b).multiplyScalar(0.5);
        if (inAny(_m.x + _n.x, _m.y + _n.y, _m.z + _n.z) !== inAny(_m.x - _n.x, _m.y - _n.y, _m.z - _n.z)) {
          segs.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
        }
      }
    }
    function curve(fn, K, lo, hi) {    // sampled curve, trimmed exactly to lo <= y <= hi
      const ok = p => p.y >= lo && p.y <= hi;
      let u0 = 0, p0 = fn(0), in0 = ok(p0);
      for (let i = 1; i <= K; i++) {
        const u1 = i / K, p1 = fn(u1), in1 = ok(p1);
        if (in0 && in1) addSeg(p0, p1);
        else if (in0 !== in1) {
          let a = u0, b = u1;
          for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (ok(fn(m)) === in0) a = m; else b = m; }
          if (in0) addSeg(p0, fn(a)); else addSeg(fn(b), p1);
        }
        u0 = u1; p0 = p1; in0 = in1;
      }
    }
    const HN = Math.hypot(NS.x, NS.z);
    function buildSection(c) {
      segs.length = 0;
      // boxes: the plane meets the 12 edges; order the points around their centroid
      boxCorners.forEach(V => {
        const pts = [];
        for (const [i, j] of boxEdges) {
          const dp = NS.dot(V[i]) - c, dq = NS.dot(V[j]) - c;
          if ((dp > 0) !== (dq > 0)) pts.push(V[i].clone().lerp(V[j], dp / (dp - dq)));
        }
        if (pts.length < 3) return;
        const cen = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        const ang = p => { const d = p.clone().sub(cen); return Math.atan2(d.dot(E2), d.dot(E1)); };
        pts.sort((p, q) => ang(p) - ang(q));
        pts.forEach((p, k) => addSeg(p, pts[(k + 1) % pts.length]));
      });
      // containment wall
      curve(u => {
        const a = u * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
        return new THREE.Vector3(RC * ca, (c - NS.x * RC * ca - NS.z * RC * sa) / NS.y, RC * sa);
      }, 128, Y0, Y0 + HC);
      // containment floor (a chord on the plinth)
      const k = (c - NS.y * Y0) / HN;
      if (Math.abs(k) < RC) {
        const t = Math.sqrt(RC * RC - k * k), nx = NS.x / HN, nz = NS.z / HN;
        addSeg(new THREE.Vector3(nx * k - nz * t, Y0, nz * k + nx * t), new THREE.Vector3(nx * k + nz * t, Y0, nz * k - nx * t));
      }
      // dome
      const d = c - NS.dot(Cd);
      if (Math.abs(d) < RC) {
        const r = Math.sqrt(RC * RC - d * d), cc = Cd.clone().addScaledVector(NS, d);
        curve(u => {
          const a = u * 2 * Math.PI;
          return cc.clone().addScaledVector(E1, r * Math.cos(a)).addScaledVector(E2, r * Math.sin(a));
        }, 128, Y0 + HC, Infinity);
      }
      return segs.length > 0;
    }

    // ---------- dashed outline of the plant (drawn behind the cut) + depth-only occluder ----------
    const phantom = new THREE.Group();
    plant.add(phantom);
    const ph = [];
    const gen = [RG.clone().multiplyScalar(RC), RG.clone().multiplyScalar(-RC)];
    for (const g of gen) ph.push(g.x, Y0, g.z, g.x, Y0 + HC, g.z);
    const base = [];
    for (let i = 0; i <= 72; i++) {
      const a = phiV - Math.PI / 2 + (i / 72) * Math.PI;
      base.push(new THREE.Vector3(RC * Math.cos(a), Y0, RC * Math.sin(a)));
    }
    polySeg(base, ph);
    const domeSil = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI;
      domeSil.push(Cd.clone().addScaledVector(RG, RC * Math.cos(t)).addScaledVector(UPV, RC * Math.sin(t)));
    }
    polySeg(domeSil, ph);
    for (const b of [AUX, TURB, ANNEX]) ph.push(...boxPhantom(b, Y0, Y0 + b.h));
    S.lines(ph, { width: 1.0, color: C.muted, dashed: true, dashSize: 2.2, gapSize: 1.7, clippingPlanes: [clipGhost] }, phantom);
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    occMat.clippingPlanes = [clipGhost];
    for (const geo of [containmentGeo(), boxAt(AUX), boxAt(TURB), boxAt(ANNEX)]) {
      const m = new THREE.Mesh(geo, occMat);
      m.position.y = Y0;
      m.renderOrder = -2;
      m.castShadow = false; m.receiveShadow = false;
      phantom.add(m);
    }

    // ---------- the mosaic ----------
    const field = S.part('Households');
    const fPlinth = new THREE.Group();                 // pivot at the near-left corner (closest to the plant)
    const corner = new THREE.Vector3(FC.x - FW / 2 - FPAD, 0, FC.z + FW / 2 + FPAD);
    fPlinth.position.copy(corner);
    field.add(fPlinth);
    const PW = FW + 2 * FPAD;
    S.solid(boxGeo(PW, FY, PW).translate(PW / 2, 0, -PW / 2), {}, fPlinth);
    const fPlinthInk = inkUnder(fPlinth);

    // targets in fill order: block rows from the front edge (+z) to the back edge, each row left to right
    const targets = [];
    for (let bz = 0; bz < NB; bz++) for (let hz = 0; hz < NH; hz++) for (let bx = 0; bx < NB; bx++) for (let hx = 0; hx < NH; hx++) {
      const x = -FW / 2 + bx * CELL + PITCH / 2 + hx * PITCH;
      const z = FW / 2 - bz * CELL - PITCH / 2 - hz * PITCH;
      const red = bz * NB + bx < RED_BLOCKS;
      targets.push({ p: new THREE.Vector3(FC.x + x, FY, FC.z + z), bz, red });
    }

    // start points on the camera-facing surfaces of the plant (area weighted)
    const R = rng(606);
    const surf = [];
    const addS = (area, fn) => surf.push({ area, fn });
    addS(Math.PI * RC * HC, () => {   // containment wall, visible half
      for (;;) {
        const a = phiV - Math.PI / 2 + R() * Math.PI, y = R() * HC;
        const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const p = new THREE.Vector3(RC * Math.cos(a), Y0 + y, RC * Math.sin(a));
        if (p.z > AUX.z0 && y < AUX.h) continue;
        return { p, n };
      }
    });
    addS(Math.PI * RC * RC, () => {   // dome, camera-facing
      for (;;) {
        const u = R() * 2 - 1, t = R() * Math.PI * 2;
        const n = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(t), Math.abs(u), Math.sqrt(1 - u * u) * Math.sin(t));
        if (n.dot(VIEW) < 0.05) continue;
        return { p: Cd.clone().addScaledVector(n, RC), n };
      }
    });
    const roof = (b) => () => {
      for (;;) {
        const x = lerp(b.x0, b.x1, R()), z = lerp(b.z0, b.z1, R());
        if (x * x + z * z < RC * RC) continue;
        return { p: new THREE.Vector3(x, Y0 + b.h, z), n: new THREE.Vector3(0, 1, 0) };
      }
    };
    const wallX = (b, y0) => () => ({ p: new THREE.Vector3(b.x1, Y0 + lerp(y0, b.h, R()), lerp(b.z0, b.z1, R())), n: new THREE.Vector3(1, 0, 0) });
    const wallZ = (b, y0) => () => ({ p: new THREE.Vector3(lerp(b.x0, b.x1, R()), Y0 + lerp(y0, b.h, R()), b.z1), n: new THREE.Vector3(0, 0, 1) });
    addS((AUX.x1 - AUX.x0) * (AUX.z1 - AUX.z0) * 0.8, roof(AUX));
    addS((AUX.z1 - AUX.z0) * AUX.h, wallX(AUX, 0));
    addS((TURB.x1 - TURB.x0) * (TURB.z1 - TURB.z0), roof(TURB));
    addS((TURB.z1 - TURB.z0) * (TURB.h - ANNEX.h), wallX(TURB, ANNEX.h));
    addS((TURB.x1 - TURB.x0) * TURB.h, wallZ(TURB, 0));
    addS((ANNEX.x1 - ANNEX.x0) * (ANNEX.z1 - ANNEX.z0), roof(ANNEX));
    addS((ANNEX.z1 - ANNEX.z0) * ANNEX.h, wallX(ANNEX, 0));
    addS((ANNEX.x1 - ANNEX.x0) * ANNEX.h, wallZ(ANNEX, 0));
    const totalA = surf.reduce((s, x) => s + x.area, 0);
    const houses = [];
    for (let k = 0; k < N; k++) {
      let r = R() * totalA, s = surf[0];
      for (const x of surf) { if (r < x.area) { s = x; break; } r -= x.area; }
      const { p, n } = s.fn();
      const start = p.clone();
      if (n.y < 0.99) { start.addScaledVector(n, 1.0); start.y -= 0.7; }
      const t0 = Math.max(0, releaseMs(p) + (R() - 0.5) * 40);
      houses.push({ start, t0 });
    }
    houses.sort((a, b) => a.t0 - b.t0);
    const reds = [], greys = [];
    const groupLand = new Map();                       // outline group -> last landing (ms)
    houses.forEach((h, k) => {
      const tg = targets[k];
      h.goal = tg.p;
      h.dur = FLY + (R() - 0.5) * FLY_J;
      h.key = tg.bz * 2 + (tg.red ? 0 : 1);
      groupLand.set(h.key, Math.max(groupLand.get(h.key) || 0, h.t0 + h.dur));
      const dist = h.start.distanceTo(h.goal);
      h.ctrl = h.start.clone().add(h.goal).multiplyScalar(0.5);
      h.ctrl.y += 6 + 0.06 * dist;
      (tg.red ? reds : greys).push(h);
    });
    const hg = houseGeo();
    const mkInst = (list, color) => {
      const m = new THREE.InstancedMesh(hg, S.material(color), list.length);
      m.frustumCulled = false;
      m.castShadow = false;            // flying specks must not smudge the ground
      m.receiveShadow = false;         // (with VSM shadows, receivers are drawn into the shadow map too)
      m.renderOrder = -3;              // drawn before the outline's depth-only occluder, so they never vanish behind it
      field.add(m);
      return m;
    };
    const imRed = mkInst(reds, C.red);
    const imGrey = mkInst(greys, GREY);

    // ink outlines of the settled dwellings: one merged set per block row and colour, each fades in once its row has landed
    const hpos = hg.toNonIndexed().attributes.position.array;
    const outlines = [];
    for (const [key, land] of groupLand) {
      const list = houses.filter(h => h.key === key);
      const red = key % 2 === 0;
      const arr = new Float32Array(hpos.length * list.length);
      list.forEach((h, k) => {
        for (let i = 0; i < hpos.length; i += 3) {
          arr[k * hpos.length + i] = hpos[i] + h.goal.x;
          arr[k * hpos.length + i + 1] = hpos[i + 1] + h.goal.y;
          arr[k * hpos.length + i + 2] = hpos[i + 2] + h.goal.z;
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const col = red ? C.redDeep : GREY_EDGE;
      const l = edgeLinesFromGeometry(g, { color: col, color2: col, width: 0.75, width2: 0.6, creaseAngle: 20 });
      field.add(l);
      outlines.push({ l, t0: land + 40 });
    }

    const _p = new THREE.Vector3();
    function placeHouses(list, im, ms) {
      const a = im.instanceMatrix.array;
      for (let k = 0; k < list.length; k++) {
        const h = list[k];
        let sc = 0, t = 0;
        if (ms > h.t0) {
          sc = ease.out(sub(ms, h.t0, h.t0 + POP));
          t = ease.inOut(sub(ms, h.t0, h.t0 + h.dur));
        }
        const u = 1 - t;           // quadratic Bezier start -> ctrl -> goal
        _p.set(
          u * u * h.start.x + 2 * u * t * h.ctrl.x + t * t * h.goal.x,
          u * u * h.start.y + 2 * u * t * h.ctrl.y + t * t * h.goal.y,
          u * u * h.start.z + 2 * u * t * h.ctrl.z + t * t * h.goal.z);
        const o = k * 16;
        a[o] = sc; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
        a[o + 4] = 0; a[o + 5] = sc; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sc; a[o + 11] = 0;
        a[o + 12] = _p.x; a[o + 13] = _p.y; a[o + 14] = _p.z; a[o + 15] = 1;
      }
      im.instanceMatrix.needsUpdate = true;
      im.visible = ms > WIPE[0] - 50;
    }

    // ---------- state application ----------
    let P1 = 0, P2 = 0;
    const lastRelease = houses[houses.length - 1].t0;
    function update() {
      // beat 1: the plinth unfolds, then the volumes rise out of it one after another (80 ms apart)
      const t1 = P1 * T1;
      const pk = ease.out(sub(t1, 0, 520));
      plinth.scale.set(Math.max(1e-3, pk), 1, Math.max(1e-3, pk));
      plinth.visible = pk > 0.001;
      for (const l of plinthInk) l.material.setOpacity(sub(t1, 0, 200));
      const hx = PHX * pk + 0.05, hz = PHZ * pk + 0.05;
      clipPl[0].constant = -(PCX - hx); clipPl[1].constant = PCX + hx;
      clipPl[2].constant = -(PCZ - hz); clipPl[3].constant = PCZ + hz;
      fp.forEach((l, i) => { const v = sub(t1, 120 + i * 80, 260 + i * 80); l.material.setOpacity(v); l.visible = v > 0.002; });
      // each volume starts to rise once the unfolding plinth is fully under it (pk > 0.92 at 300 ms)
      volumes.forEach(({ g, h }, i) => {
        const lt = sub(t1, 300 + i * 80, 300 + i * 80 + 760);
        g.position.y = Y0 - h * (1 - ease.out(lt));
        g.visible = lt > 0.001;
      });
      // beat 2
      const ms = P2 * T2;
      const c = P2 > 0 ? cutAt(ms) : 1e4;
      clipSolid.constant = c;
      clipGhost.constant = -c;
      solids.visible = P1 > 0.001 && ms < lastRelease + 60;
      // section outline of the cut (rebuilt while the plane is inside the plant)
      let cutting = solids.visible && P1 > 0.999 && c > dMin && c < dMax && buildSection(c);
      if (cutting) {
        const n = Math.min(SEC_MAX, segs.length / 6);
        secBuf.set(n * 6 < segs.length ? segs.slice(0, n * 6) : segs);
        sec.geometry.attributes.instanceStart.data.needsUpdate = true;
        sec.geometry.instanceCount = n;
      }
      sec.visible = !!cutting;
      // soft shadows fade out while the camera pulls back, before the cut starts (the cut is not applied to the
      // shadow pass: clipShadows hangs SwiftShader renders); state 2 has nothing tall left to cast one anyway
      S.key.shadow.intensity = SH0 * (1 - ease.inOut(sub(ms, SHF[0], SHF[1])));
      phantom.visible = ms > WIPE[0] - 50;
      const fk = ease.out(sub(ms, FPL[0], FPL[1]));
      fPlinth.scale.set(Math.max(1e-3, fk), 1, Math.max(1e-3, fk));
      fPlinth.visible = fk > 0.001;
      for (const l of fPlinthInk) l.material.setOpacity(sub(ms, FPL[0], FPL[0] + 150));
      placeHouses(reds, imRed, ms);
      placeHouses(greys, imGrey, ms);
      for (const o of outlines) {
        const v = ease.out(sub(ms, o.t0, o.t0 + OUT_DUR));
        o.l.material.setOpacity(v);
        o.l.visible = v > 0.002;
      }
      // camera: state 1 is a close hero of the plant; beat 2 pulls back and left to make room for the mosaic
      setView(ease.inOut(sub(ms, CAM[0], CAM[1])));
      if (L1a) L1a.o.place.x = S.project(domeSide).x + 44;
      if (L1b) L1b.o.place.x = S.project(domeTop).x;
      if (L2) L2.o.place.x = S.project(fAnchor).x;
    }
    function setView(k) {
      S.view.scale = lerp(S1, S2, k);
      S.view.at[0] = lerp(AT1[0], AT2[0], k);
      S.view.at[1] = lerp(AT1[1], AT2[1], k);
      S.applyView();
    }
    let L1a = null, L1b = null, L2 = null;
    const domeTop = new THREE.Vector3(0, Y0 + HC, 0).addScaledVector(UPV, RC);
    const A20 = 20 * DEG;   // a point on the dome's right-hand silhouette, 20 degrees above the springline
    const domeSide = new THREE.Vector3(0, Y0 + HC, 0).addScaledVector(RG, RC * Math.cos(A20)).addScaledVector(UPV, RC * Math.sin(A20));
    let fAnchor = null;
    S.anim.prop('p1', 0, v => { P1 = v; update(); }, { kind: 'move', dur: T1 });
    S.anim.prop('p2', 0, v => { P2 = v; update(); }, { kind: 'move', dur: T2 });

    // ---------- labels ----------
    const L1_TEXT = 'Output of one nuclear reactor: 2 million TOE a year';
    const L1_LINES = ['Output of one nuclear reactor:', '2 million TOE a year'];
    // state 1: beside the dome, one horizontal leader
    setView(0);
    L1a = S.label({
      text: L1_TEXT, anchor: domeSide, anchorObj: plant,
      place: { mode: 'column', x: S.project(domeSide).x + 44 },
    });
    breakLines(L1a, L1_LINES);
    // state 2: the same words over the outline the plant leaves behind, beside the households label
    setView(1);
    L1b = S.label({
      text: L1_TEXT, anchor: domeTop, anchorObj: plant,
      place: { mode: 'fixed', x: S.project(domeTop).x, y: 24, ax: 'center', ay: 'top' }, leader: 'v',
    });
    breakLines(L1b, L1_LINES);
    // anchor: the top-most dwelling (back corner of the mosaic), seen from the state-2 view
    let best = null, bestY = 1e9;
    for (const t of targets) {
      const q = S.project(new THREE.Vector3(t.p.x, FY + 1.4, t.p.z));
      if (q.y < bestY) { bestY = q.y; best = t.p; }
    }
    fAnchor = new THREE.Vector3(best.x, FY + 1.4, best.z);
    L2 = S.label({
      text: '1.68 million households plus building retrofits',
      anchor: fAnchor, anchorObj: field,
      place: { mode: 'fixed', x: S.project(fAnchor).x, y: 24, ax: 'center', ay: 'top' }, leader: 'v',
    });
    breakLines(L2, ['1.68 million households', 'plus building retrofits']);
    labelProp(S, 'L1a', L1a);
    labelProp(S, 'L1b', L1b);
    labelProp(S, 'L2', L2);

    // compile every program the beats will use now (dwellings, outlines, dashed ghost are hidden at load), so the
    // first frames of a beat never stall on shader compiles
    const hidden = [];
    S.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { S.renderer.compile(S.scene, S.camera); } catch (e) { /* only a warm-up */ }
    for (const o of hidden) o.visible = false;
    update();

    return {
      targets: n => ({ p1: n >= 1 ? 1 : 0, p2: n >= 2 ? 1 : 0, L1a: n === 1 ? 1 : 0, L1b: n >= 2 ? 1 : 0, L2: n >= 2 ? 1 : 0 }),
      plan(name, from, to, dir, n, prev) {
        if (dir > 0) {
          const d1 = prev < 1 ? T1 : 0;   // a jump from 0 builds the plant first
          return {
            p1: { dur: T1, ease: ease.linear },
            L1a: to > from ? { delay: 1150, dur: 520 } : { delay: 0, dur: 380, ease: ease.in },
            p2: { dur: T2, delay: d1, ease: ease.linear },
            L1b: { delay: d1 + L1B_DELAY, dur: 520 },
            L2: { delay: d1 + L2_DELAY, dur: 520 },
          }[name] || null;
        }
        // backward: labels leave first, then the motion replays in reverse at a brisker pace
        const r2 = prev >= 2 ? 200 + BACK2 : 0;          // time the rewind of beat 2 takes
        return {
          L2: { dur: 320, ease: ease.in },
          L1b: { dur: 320, ease: ease.in },
          p2: { dur: BACK2, delay: 200, ease: ease.linear },
          L1a: to > from ? { delay: r2 + 60, dur: 520, ease: ease.out } : { dur: 320, ease: ease.in },
          p1: { dur: 900, delay: r2 + (prev >= 2 ? 0 : 150), ease: ease.linear },
        }[name] || null;
      },
    };
  },
});
