// s06-reactor — One Less Nuclear Power Plant (OLNPP Phase 1).
// State 1: a Korean nuclear plant as a white study model: containment (cylinder + hemispherical dome), auxiliary
// building, long turbine hall with its lower side annex. Coastal and seawater-cooled, so NO cooling tower.
// State 2: the plant dissolves top-down into 1,680 tiny dwellings (one per 1,000 Eco-Mileage households) that fly
// right and settle into a tidy block: 79% red (efficiency), 21% grey (renewables). The plant stays as a dashed
// phantom: the plant Seoul did not need.
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
const DOME_TOP = Y0 + HC + RC;
const AUX = { x0: -24, x1: 24, z0: 12, z1: 44, h: 26 };
const TURB = { x0: -20, x1: 20, z0: 44, z1: 128, h: 34 };
const ANNEX = { x0: 20, x1: 28, z0: 44, z1: 128, h: 14 };
const PLINTH = { x0: -32, x1: 36, z0: -29, z1: 136 };

// ---- field of dwellings ----
const NX = 30, NZ = 56, N = NX * NZ;  // 1,680 dwellings
const N_RED = Math.round(N * 0.79);   // efficiency 79% · renewables 21%
const PITCH = 2.6;
const FIELD_D = 156;                  // distance from plant centre along screen-right
const FC = RG.clone().multiplyScalar(FIELD_D);
const FY = 1.5;                       // field plinth top
const GREY = '#BDBCB8';
const GREY_EDGE = '#8E8F92';

// beat 2 choreography (fractions of the beat): camera pan, then the top-down dissolve, flights, outlines
const PAN = [0, 0.2];
const WIPE0 = 0.12, WIPE1 = 0.6;
const OUTLINE = [0.9, 1];
const SCALE = 2.7, AT1 = [655, 262], AT2 = [384, 262];
const H_TOP = DOME_TOP + 0.6;
const H_BOT = Y0 - 0.6;

function houseGeo() {
  const w = 1.9, d = 1.9, h = 1.2, r = 2.05;
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
    pts.push(new THREE.Vector2(Math.max(1e-4, RC * Math.cos(a)), HC + RC * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, 120);
  g.computeVertexNormals();
  return g;
}

const boxAt = (b, h = b.h) => boxGeo(b.x1 - b.x0, h, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);

// visible edges of an axis-aligned box seen from the (+x, +y, +z) side (for the dashed phantom)
function boxPhantom(b, y0, y1) {
  const { x0, x1, z0, z1 } = b;
  const s = [];
  const L = (p, q) => s.push(p[0], p[1], p[2], q[0], q[1], q[2]);
  L([x0, y1, z0], [x1, y1, z0]); L([x1, y1, z0], [x1, y1, z1]); L([x1, y1, z1], [x0, y1, z1]); L([x0, y1, z1], [x0, y1, z0]);
  L([x1, y0, z0], [x1, y1, z0]); L([x1, y0, z1], [x1, y1, z1]); L([x0, y0, z1], [x0, y1, z1]);
  L([x1, y0, z0], [x1, y0, z1]); L([x1, y0, z1], [x0, y0, z1]);
  return s;
}

function polySeg(pts, out) {
  for (let i = 0; i < pts.length - 1; i++) out.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  return out;
}

export default defineDiagram({
  id: 's06-reactor',
  states: 2,
  region: { x: 100, y: 420, w: 1080, h: 420 },
  stage: {
    view: { azimuth: AZ, elevation: EL, target: [0, 0, 0], scale: SCALE, at: AT1.slice() },
    shadowBox: { min: [-36, 0, -210], max: [138, 66, 140] },
  },
  build(S) {
    const plant = S.part('Nuclear plant');

    // ---------- plinth ----------
    const plinth = new THREE.Group();
    plant.add(plinth);
    S.solid(boxGeo(PLINTH.x1 - PLINTH.x0, Y0, PLINTH.z1 - PLINTH.z0).translate((PLINTH.x0 + PLINTH.x1) / 2, 0, (PLINTH.z0 + PLINTH.z1) / 2), {}, plinth);

    // ---------- buildings (clipped top-down in beat 2) ----------
    const clipDown = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);   // keeps y <= h
    const clipUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e4);     // keeps y >= h
    const mat = S.material(C.model, { unique: true, clippingPlanes: [clipDown], side: THREE.DoubleSide });
    mat.clipShadows = true;
    const eClip = { clippingPlanes: [clipDown] };
    const solids = new THREE.Group();
    plant.add(solids);
    const mk = (geo) => {
      const g = new THREE.Group();
      g.position.y = Y0;
      solids.add(g);
      S.solid(geo, { material: mat, edges: eClip }, g);
      return g;
    };
    const gCont = mk(containmentGeo());
    const gAux = mk(boxAt(AUX));
    const gTurb = mk(boxAt(TURB));
    const gAnnex = mk(boxAt(ANNEX));

    // hairline detail: springline of the dome, aux roof meeting the containment, turbine hall bays
    const hair = { width: LW.hair, color: C.hair, clippingPlanes: [clipDown] };
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
    S.lines(polySeg(arc, []), { width: LW.crease, color: C.crease, clippingPlanes: [clipDown] }, gAux);
    const bays = [];
    for (let k = 1; k < 8; k++) {
      const z = TURB.z0 + (k * (TURB.z1 - TURB.z0)) / 8;
      bays.push(TURB.x1 + 0.02, ANNEX.h, z, TURB.x1 + 0.02, TURB.h, z);
    }
    S.lines(bays, hair, gTurb);

    // ---------- phantom (dashed) + depth-only occluder ----------
    const phantom = new THREE.Group();
    plant.add(phantom);
    const ph = [];
    const Cd = new THREE.Vector3(0, Y0 + HC, 0);
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
    const phLines = S.lines(ph, { width: 1.0, color: C.muted, dashed: true, dashSize: 2.2, gapSize: 1.7, clippingPlanes: [clipUp] }, phantom);
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
    occMat.clippingPlanes = [clipUp];
    for (const geo of [containmentGeo(), boxAt(AUX), boxAt(TURB), boxAt(ANNEX)]) {
      const m = new THREE.Mesh(geo, occMat);
      m.position.y = Y0;
      m.renderOrder = -2;
      m.castShadow = false; m.receiveShadow = false;
      phantom.add(m);
    }

    // ---------- field of dwellings ----------
    const field = S.part('Households');
    const fPlinth = new THREE.Group();
    fPlinth.position.set(FC.x, 0, FC.z);
    field.add(fPlinth);
    S.solid(boxGeo(NX * PITCH + 5, FY, NZ * PITCH + 5), {}, fPlinth);

    // targets in fill order: rows along z from the plant side (+z) to the far end
    const targets = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      targets.push(new THREE.Vector3(FC.x + (i - (NX - 1) / 2) * PITCH, FY, FC.z + ((NZ - 1) / 2 - j) * PITCH));
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
    const hAt = (p2) => H_TOP - (H_TOP - H_BOT) * sub(p2, WIPE0, WIPE1);
    const releaseAt = (y) => WIPE0 + (WIPE1 - WIPE0) * (H_TOP - y) / (H_TOP - H_BOT);
    const houses = [];
    for (let k = 0; k < N; k++) {
      let r = R() * totalA, s = surf[0];
      for (const x of surf) { if (r < x.area) { s = x; break; } r -= x.area; }
      const { p, n } = s.fn();
      const start = p.clone();
      if (n.y < 0.99) { start.addScaledVector(n, 1.1); start.y -= 1.0; }
      const t0 = Math.max(0, releaseAt(p.y) + (R() - 0.5) * 0.02);
      houses.push({ start, t0 });
    }
    houses.sort((a, b) => a.t0 - b.t0);
    const reds = [], greys = [];
    houses.forEach((h, k) => {
      h.goal = targets[k];
      const dist = h.start.distanceTo(h.goal);
      h.dur = Math.min(0.3 + 0.08 * R(), OUTLINE[0] + 0.05 - h.t0);
      h.ctrl = h.start.clone().add(h.goal).multiplyScalar(0.5);
      h.ctrl.y += 5 + 0.05 * dist;
      (k < N_RED ? reds : greys).push(h);
    });
    const hg = houseGeo();
    const mkInst = (list, color) => {
      const m = new THREE.InstancedMesh(hg, S.material(color), list.length);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      field.add(m);
      return m;
    };
    const imRed = mkInst(reds, C.red);
    const imGrey = mkInst(greys, GREY);
    // ink outlines of the settled dwellings (one merged static set per colour, drawn in once they have landed)
    const hpos = hg.toNonIndexed().attributes.position.array;
    const mkOutline = (list, color) => {
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
      const l = edgeLinesFromGeometry(g, { color, color2: color, width: 0.75, width2: 0.6, creaseAngle: 20 });
      field.add(l);
      return l;
    };
    const olRed = mkOutline(reds, C.redDeep);
    const olGrey = mkOutline(greys, GREY_EDGE);

    const _p = new THREE.Vector3();
    function placeHouses(list, im, p2) {
      const a = im.instanceMatrix.array;
      for (let k = 0; k < list.length; k++) {
        const h = list[k];
        let sc, t;
        if (p2 <= h.t0) { sc = 0; t = 0; }
        else {
          sc = sub(p2, h.t0, h.t0 + 0.035, ease.out);
          t = ease.inOut(sub(p2, h.t0, h.t0 + h.dur));
        }
        // quadratic Bézier start → ctrl → goal
        const u = 1 - t;
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
      im.visible = p2 > 0.0005;
    }

    // ---------- state application ----------
    let P1 = 0, P2 = 0;
    const grow = (g, v) => { g.scale.y = Math.max(1e-3, v); g.visible = v > 0.002; };
    function update() {
      // beat 1: plinth, then the volumes rise
      grow(plinth, sub(P1, 0, 0.3, ease.out));
      grow(gCont, sub(P1, 0.12, 0.62, ease.out));
      grow(gAux, sub(P1, 0.24, 0.72, ease.out));
      grow(gTurb, sub(P1, 0.32, 0.86, ease.out));
      grow(gAnnex, sub(P1, 0.44, 1, ease.out));
      // beat 2: top-down dissolve into dwellings, phantom drawn in behind the cut
      const h = hAt(P2);
      clipDown.constant = h;
      clipUp.constant = -h;
      solids.visible = P1 > 0.001 && h > H_BOT + 0.05;
      phantom.visible = P2 > 0.0005;
      grow(fPlinth, sub(P2, WIPE0, WIPE0 + 0.22, ease.out));
      placeHouses(reds, imRed, P2);
      placeHouses(greys, imGrey, P2);
      const ol = sub(P2, OUTLINE[0], OUTLINE[1], ease.out);
      for (const l of [olRed, olGrey]) { l.material.setOpacity(ol); l.visible = ol > 0.002; }
      // camera: state 1 centres the plant; beat 2 pans it left to make room for the dwellings
      const c = ease.inOut(sub(P2, PAN[0], PAN[1]));
      S.view.at[0] = lerp(AT1[0], AT2[0], c);
      S.view.at[1] = lerp(AT1[1], AT2[1], c);
      S.applyView();
      if (L1) L1.o.place.x = S.project(domeTop).x;
      if (L2) L2.o.place.x = S.project(fAnchor).x;
    }
    let L1 = null, L2 = null;
    const domeTop = new THREE.Vector3(0, Y0 + HC, 0).addScaledVector(UPV, RC);
    let fAnchor = null;
    S.anim.prop('p1', 0, v => { P1 = v; update(); }, { kind: 'reveal', dur: 1500 });
    S.anim.prop('p2', 0, v => { P2 = v; update(); }, { kind: 'move', dur: 3600 });

    // ---------- labels (top band, centred over each model, vertical leaders) ----------
    const dTop = S.project(domeTop);
    L1 = S.label({
      text: 'Output of one nuclear reactor: 2 million TOE a year',
      anchor: domeTop, anchorObj: plant,
      place: { mode: 'fixed', x: dTop.x, y: 24, ax: 'center', ay: 'top' }, leader: 'v',
      maxWidth: 345, nowrap: false,
    });
    // anchor: back-edge dwelling (i = 0 row) closest to the field's screen centre
    S.view.at[0] = AT2[0]; S.view.at[1] = AT2[1]; S.applyView();   // the field is only seen from the state-2 view
    const fcx = S.project(new THREE.Vector3(FC.x, FY, FC.z)).x;
    let best = null, bestD = 1e9;
    for (let j = 0; j < NZ; j++) {
      const t = targets[j * NX];
      const q = S.project(new THREE.Vector3(t.x, FY + 2.05, t.z));
      const d = Math.abs(q.x - fcx);
      if (d < bestD) { bestD = d; best = t; }
    }
    fAnchor = new THREE.Vector3(best.x, FY + 2.05, best.z);
    const fTop = S.project(fAnchor);
    update();
    L2 = S.label({
      text: '1.68 million households plus building retrofits',
      anchor: fAnchor, anchorObj: field,
      place: { mode: 'fixed', x: fTop.x, y: 24, ax: 'center', ay: 'top' }, leader: 'v',
      maxWidth: 300, nowrap: false,
    });
    labelProp(S, 'L1', L1);
    labelProp(S, 'L2', L2);
    update();

    return {
      targets: n => ({ p1: n >= 1 ? 1 : 0, p2: n >= 2 ? 1 : 0, L1: n >= 1 ? 1 : 0, L2: n >= 2 ? 1 : 0 }),
      plan(name, from, to, dir, n, prev) {
        if (dir > 0) {
          const d1 = prev < 1 ? 1500 : 0;   // a jump from 0 builds the plant first
          return {
            p1: { dur: 1500, ease: ease.linear },
            L1: { delay: 1250 },
            p2: { dur: 3600, delay: d1, ease: ease.linear },
            L2: { delay: d1 + 3350 },
          }[name] || null;
        }
        return {
          p1: { dur: 700, delay: 150, ease: ease.linear },
          p2: { dur: 1400, delay: 150, ease: ease.linear },
          L1: { dur: 300 }, L2: { dur: 300 },
        }[name] || null;
      },
    };
  },
});
