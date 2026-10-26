// s10-edc — Seoul Energy Dream Center, sectional axonometric.
// Geometry follows Fraunhofer ISE's description and site photos: square plan; the three-storey volume widens
// conically upward through a 45° rotation (ground-floor square rotated 45° under a larger square roof), so the
// façades become acute triangles; wedge-shaped "wings" rise diagonally across the storeys from the ground to each
// roof corner (pinwheel); PV on roof and wings (the small ground array sits behind the building in this view); the building stands on a pile-supported
// reinforced-concrete base plate because the landfill below cannot bear load; geothermal loops for heating/cooling.
// States: 1 landfill strata · 2 piles + base plate · 3 storeys rise and rotate 45° · 4 wings + PV · 5 geothermal.
import {
  defineDiagram, THREE, C, LW, ease, sub, lerp, labelProp, setOpacity,
  boxGeo, prismGeo, extractEdges, rng,
} from '../kit3d/index.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

const DEG = Math.PI / 180;

// ---- dimensions (m) ----
const W = 26;              // half-width of the ground block
const Y_SOIL = -1.2;       // underside of the topsoil cap
const Y_WASTE = -13.5;     // underside of the compacted waste
const Y_BOT = -19.5;       // bottom of the bearing stratum shown
const R_BOT = 18.4;        // ground-floor square, vertices on the axes (rotated 45°)
const HALF_TOP = 22;       // top of the conical volume: axis-aligned square, half side
const H_CORE = 14;         // three storeys
const ROOF_T = 1.2;
const ROOF_HALF = 23.2;
const FLOORS = [4.67, 9.33];
const PILE_TIP = -16.3;
const PLATE_T = 1.2;

const ROT = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

// Conical volume between the bottom square (vertices at 90k°) and the top square (corners at 90k°+phi).
// phi = 0: untwisted flared frustum; phi = 45°: the built form (acute triangular façades).
function corePoints(phi) {
  const rT = HALF_TOP * Math.SQRT2;
  const B = [], T = [];
  for (let k = 0; k < 4; k++) {
    B.push(new THREE.Vector3(R_BOT * Math.cos(k * 90 * DEG), 0, R_BOT * Math.sin(k * 90 * DEG)));
    const a = k * 90 * DEG + phi;
    T.push(new THREE.Vector3(rT * Math.cos(a), H_CORE, rT * Math.sin(a)));
  }
  return { B, T };
}

function coreTriangles(phi) {
  const { B, T } = corePoints(phi);
  const tris = [];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4, km = (k + 3) % 4;
    tris.push([B[k], B[k1], T[k]]);      // up-pointing (glazed corner) triangle
    tris.push([T[km], T[k], B[k]]);      // down-pointing (white wall) triangle
  }
  return { tris, B, T };
}

function writeCoreGeometry(geo, phi) {
  const { tris, B, T } = coreTriangles(phi);
  const pos = [];
  const push = (a, b, c) => {
    // orient outward (centroid away from the vertical axis / caps by sign)
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const cen = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const out = new THREE.Vector3(cen.x, 0, cen.z);
    if (n.dot(out) < 0) { pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z); }
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (const t of tris) push(t[0], t[1], t[2]);
  // caps
  pos.push(T[0].x, T[0].y, T[0].z, T[2].x, T[2].y, T[2].z, T[1].x, T[1].y, T[1].z);
  pos.push(T[0].x, T[0].y, T[0].z, T[3].x, T[3].y, T[3].z, T[2].x, T[2].y, T[2].z);
  pos.push(B[0].x, B[0].y, B[0].z, B[1].x, B[1].y, B[1].z, B[2].x, B[2].y, B[2].z);
  pos.push(B[0].x, B[0].y, B[0].z, B[2].x, B[2].y, B[2].z, B[3].x, B[3].y, B[3].z);
  const arr = new Float32Array(pos);
  if (!geo.attributes.position || geo.attributes.position.count !== arr.length / 3) geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  else { geo.attributes.position.array.set(arr); geo.attributes.position.needsUpdate = true; }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function writeEdgeGeometry(lineGeo, geo) {
  const e = extractEdges(geo, 12);
  lineGeo.setPositions(e.positions);
  lineGeo.setAttribute('instanceNA', new THREE.InstancedBufferAttribute(e.na, 3));
  lineGeo.setAttribute('instanceNB', new THREE.InstancedBufferAttribute(e.nb, 3));
  lineGeo.setAttribute('instanceKind', new THREE.InstancedBufferAttribute(e.kind, 1));
}

// horizontal section of the conical volume at height y (octagon through the 8 lateral edges)
function sectionAt(phi, y, grow = 0) {
  const { B, T } = corePoints(phi);
  const t = y / H_CORE;
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    for (const [b, tt] of [[B[k], T[k]], [B[k1], T[k]]]) {
      const p = new THREE.Vector3().lerpVectors(b, tt, t);
      p.x *= 1 + grow; p.z *= 1 + grow;
      pts.push(p);
    }
  }
  return pts;
}

function loopSegments(pts) {
  const s = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return s;
}

export default defineDiagram({
  id: 's10-edc',
  states: 5,
  region: { x: 100, y: 300, w: 1110, h: 680 },
  stage: {
    view: { azimuth: 32, elevation: 22, target: [0, 0, 0], scale: 10, at: [384, 318] },
    shadowBox: { min: [-28, -20, -28], max: [28, 17, 28] },
    ground: false,
  },
  build(stage) {
    const S = stage;

    // ================= 1. ground section (topsoil, compacted waste, bearing stratum) =================
    const ground = S.part('Ground section');
    const clipGround = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const notchL = [[-W, -W], [W, -W], [W, 0], [0, 0], [0, W], [-W, W]];   // front quadrant cut away
    const gMat = S.material(C.model, { unique: true, clippingPlanes: [clipGround] });
    const cutMat = S.material('#F1F0EC', { unique: true, clippingPlanes: [clipGround] });
    const bearMat = S.material('#E9E8E3', { unique: true, clippingPlanes: [clipGround] });
    const eClip = { clippingPlanes: [clipGround] };
    S.solid(boxGeo(2 * W, Y_WASTE - Y_BOT, 2 * W).translate(0, Y_BOT, 0), { material: bearMat, edges: eClip }, ground);
    S.solid(prismGeo(notchL, Y_SOIL - Y_WASTE, Y_WASTE), { material: cutMat, edges: eClip }, ground);
    S.solid(prismGeo(notchL, -Y_SOIL, Y_SOIL), { material: gMat, edges: eClip }, ground);
    // compacted-waste strata: fine horizontal bands on every visible cut face (deterministic jitter)
    const r = rng(7);
    const strata = [];
    const faces = [
      // [x0,z0,x1,z1, outward offset dx,dz]
      [W, 0, W, -W, 0.03, 0], [0, W, -W, W, 0, 0.03],      // outer faces (+x back half, +z left half)
      [0, 0, 0, W, 0.03, 0], [0, 0, W, 0, 0, 0.03],         // notch faces
    ];
    let y = Y_SOIL;
    const bandYs = [];
    while (true) {
      y -= 0.95 + r() * 0.75;
      if (y < Y_WASTE + 0.6) break;
      bandYs.push(y);
    }
    for (const by of bandYs) for (const [x0, z0, x1, z1, dx, dz] of faces) strata.push(x0 + dx, by, z0 + dz, x1 + dx, by, z1 + dz);
    // a few widely spaced lines in the bearing stratum
    for (const by of [Y_WASTE - 3.2, Y_WASTE - 6.1]) for (const [x0, z0, x1, z1, dx, dz] of [[W, W, W, -W, 0.03, 0], [W, W, -W, W, 0, 0.03]]) strata.push(x0 + dx, by, z0 + dz, x1 + dx, by, z1 + dz);
    S.lines(strata, { width: LW.hair, color: C.hair, clippingPlanes: [clipGround] }, ground);
    // moving caps for the fill animation (section at the current fill level)
    const capSq = S.solid(new THREE.PlaneGeometry(2 * W, 2 * W).rotateX(-Math.PI / 2), { material: S.material(C.model, { unique: true }) }, ground);
    const capL = S.solid(prismGeo(notchL, 0.001, 0), { material: S.material(C.model, { unique: true }) }, ground);
    capSq.visible = capL.visible = false;
    S.anim.prop('ground', 0, v => {
      const k = ease.inOut(v);
      const h = lerp(Y_BOT, 0, k);
      clipGround.constant = v >= 1 ? 1 : h;
      ground.visible = v > 0.001;
      const filling = v > 0.001 && v < 0.999;
      capSq.visible = filling && h < Y_WASTE;
      capL.visible = filling && h >= Y_WASTE;
      capSq.position.y = h; capL.position.y = h;
    }, { kind: 'reveal', dur: 1200 });

    // ================= 2. piles + base plate =================
    const pilesPart = S.part('Piles');
    const piles = [];
    const pileLen = -PILE_TIP - PLATE_T;     // from the underside of the plate down to the tip
    const pg = new THREE.CylinderGeometry(0.55, 0.55, pileLen, 20).translate(0, -pileLen / 2, 0);
    const pilePos = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const x = 1.9 + i * 3.6, z = 1.9 + j * 3.6;
      if (x + z <= R_BOT + 2.2 - 3.1) pilePos.push([x, z]);
    }
    pilePos.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    for (const [x, z] of pilePos) {
      const g = new THREE.Group();
      g.position.set(x, -PLATE_T, z);
      S.solid(pg, { creaseAngle: 40 }, g);
      pilesPart.add(g);
      piles.push(g);
    }
    const platePart = S.part('Base plate');
    const plateHalf = R_BOT + 2.2;
    const plateFoot = [[plateHalf, 0], [0, plateHalf], [-plateHalf, 0], [0, -plateHalf]];
    const plate = S.solid(prismGeo(plateFoot, PLATE_T, -PLATE_T), { material: S.material('#F4F3F0') }, platePart);
    S.anim.prop('piles', 0, v => {
      pilesPart.visible = v > 0.001;
      const n = piles.length;
      piles.forEach((g, i) => {
        const s = sub(v, 0.02 + i * (0.42 / n), 0.3 + i * (0.42 / n), ease.inOut);
        g.scale.y = Math.max(0.0001, s);
        g.visible = s > 0.001;
      });
      const d = sub(v, 0.72, 1, ease.out);
      platePart.visible = v > 0.72;
      plate.position.y = (1 - d) * 7;
      setOpacity(plate, Math.min(1, sub(v, 0.72, 0.8)));
    }, { kind: 'reveal', dur: 1700 });

    // ================= 3. the building: three storeys rising, then rotating 45° =================
    const bldg = S.part('Building');
    const coreGeo = writeCoreGeometry(new THREE.BufferGeometry(), 0);
    const coreMat = S.material(C.model, { unique: true });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = coreMesh.receiveShadow = true;
    const coreLinesGeo = new LineSegmentsGeometry();
    writeEdgeGeometry(coreLinesGeo, coreGeo);
    const coreLines = S.lines([], {}, null);
    coreLines.geometry.dispose();
    coreLines.geometry = coreLinesGeo;
    coreLines.material.dispose();
    const coreGroup = new THREE.Group();
    coreGroup.add(coreMesh);
    bldg.add(coreGroup);
    // build an edge-mode line object from a throwaway solid to reuse its material
    const tmp = S.solid(boxGeo(1, 1, 1), {}, null);
    const edgeMat = tmp.userData.lines.material;
    tmp.userData.mesh.geometry.dispose();
    tmp.userData.lines.geometry.dispose();
    coreLines.material = edgeMat;
    coreGroup.add(coreLines);
    // roof slab
    const roof = S.solid(boxGeo(2 * ROOF_HALF, ROOF_T, 2 * ROOF_HALF), {}, null);
    roof.position.y = H_CORE;
    coreGroup.add(roof);
    // floor lines (hairline section through the façade at each storey)
    const floorLines = S.lines([], { width: LW.crease, color: C.crease }, null);
    coreGroup.add(floorLines);
    // façade detail: ribbon windows on the white walls, mullions on the glazed triangles (only once rotated)
    const detail = S.lines([], { width: LW.hair, color: C.hair }, null);
    coreGroup.add(detail);
    let lastPhi = -1;
    function setPhi(phi) {
      if (Math.abs(phi - lastPhi) < 1e-5) return;
      lastPhi = phi;
      writeCoreGeometry(coreGeo, phi);
      writeEdgeGeometry(coreLinesGeo, coreGeo);
      roof.rotation.y = -phi + 45 * DEG;
      const seg = [];
      for (const fy of FLOORS) seg.push(...loopSegments(sectionAt(phi, fy, 0.004)));
      floorLines.geometry.setPositions(seg);
      // details only for the built form
      const d = [];
      if (phi > 44.9 * DEG) {
        const { B, T } = corePoints(phi);
        for (let k = 0; k < 4; k++) {
          const k1 = (k + 1) % 4, km = (k + 3) % 4;
          // ribbon windows on wall (T[km], T[k], B[k]) in storeys 2 and 3 (+ a short one in storey 1)
          for (const [y0, y1, inset] of [[1.5, 2.6, 0.2], [6.0, 7.5, 0.1], [10.7, 12.3, 0.07]]) {
            const quad = [];
            for (const yy of [y0, y1]) {
              const t = yy / H_CORE;
              const L = new THREE.Vector3().lerpVectors(B[k], T[km], t);
              const R = new THREE.Vector3().lerpVectors(B[k], T[k], t);
              quad.push(new THREE.Vector3().lerpVectors(L, R, inset), new THREE.Vector3().lerpVectors(L, R, 1 - inset));
            }
            const [a, b, c, e] = [quad[0], quad[1], quad[3], quad[2]];
            for (const p of [a, b, c, e]) { p.x *= 1.003; p.z *= 1.003; }
            d.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, e.x, e.y, e.z, e.x, e.y, e.z, a.x, a.y, a.z);
          }
          // mullions on the glazed triangle (B[k], B[k1], T[k]), parallel to the in-plane vertical
          const b0 = B[k], b1 = B[k1], tp = T[k];
          const ex = new THREE.Vector3().subVectors(b1, b0); const L = ex.length(); ex.normalize();
          const tv = new THREE.Vector3().subVectors(tp, b0);
          const tx = tv.dot(ex);
          const fy = new THREE.Vector3().copy(tv).addScaledVector(ex, -tx); const ty = fy.length(); fy.normalize();
          for (let s = 2.6; s < L - 1; s += 2.6) {
            const h = s < tx ? s * ty / tx : (L - s) * ty / (L - tx);
            const p0 = new THREE.Vector3().copy(b0).addScaledVector(ex, s);
            const p1 = new THREE.Vector3().copy(p0).addScaledVector(fy, h);
            const n = new THREE.Vector3().subVectors(b1, b0).cross(tv).normalize();
            const o = n.dot(new THREE.Vector3(p0.x, 0, p0.z)) < 0 ? -0.04 : 0.04;
            d.push(p0.x + n.x * o, p0.y + n.y * o, p0.z + n.z * o, p1.x + n.x * o, p1.y + n.y * o, p1.z + n.z * o);
          }
        }
      }
      detail.geometry.setPositions(d.length ? d : [0, 0, 0, 0, 0, 0]);
      detail.visible = d.length > 0;
      floorLines.material.needsUpdate = false;
    }
    setPhi(0);
    S.anim.prop('rise', 0, v => {
      const k = Math.max(0.0001, ease.out(v));
      coreMesh.scale.y = k;
      coreLines.scale.y = k;
      floorLines.scale.y = k;
      detail.scale.y = k;
      roof.position.y = H_CORE * k;
      bldg.visible = v > 0.001;
    }, { kind: 'reveal', dur: 1000 });
    S.anim.prop('twist', 0, v => {
      setPhi(ease.inOut(v) * 45 * DEG);
      detail.material.setOpacity(sub(v, 0.92, 1));
    }, { kind: 'move', dur: 1150 });

    // ================= 4. wings, PV, sun =================
    const wingsPart = S.part('Wings');
    const pv = S.part('PV');
    const wings = [];
    const pvMat = S.material(C.red, { roughness: 0.75 });
    const pvEdges = { color: C.redDeep, color2: C.redDeep, width: 1.1, width2: 0.6 };
    const { B: Bf, T: Tf } = corePoints(45 * DEG);
    for (let k = 0; k < 4; k++) {
      // wedge attached along the lateral edge B[k]–T[k]: rises from the ground at the façade centre to the roof corner
      const V = Bf[k].clone();
      const Cc = Tf[k].clone();
      const ang = k * 90 * DEG;
      const [ax, az] = ROT(HALF_TOP + 1.4, 3.5, ang);
      const A = new THREE.Vector3(ax, 0, az);
      const Bg = new THREE.Vector3(Cc.x, 0, Cc.z);
      const geo = new THREE.BufferGeometry();
      const P = [];
      const tri = (a, b, c) => P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const cen = new THREE.Vector3().add(V).add(A).add(Bg).add(Cc).multiplyScalar(0.25);
      const faceOut = (a, b, c) => {
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const m = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3).sub(cen);
        if (n.dot(m) < 0) tri(a, c, b); else tri(a, b, c);
      };
      faceOut(V, A, Cc); faceOut(A, Bg, Cc); faceOut(V, Bg, Cc); faceOut(V, A, Bg);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.computeVertexNormals();
      // pivot at V so the wing can grow out of the ground at the façade centre
      geo.translate(-V.x, -V.y, -V.z);
      const g = new THREE.Group();
      g.position.copy(V);
      S.solid(geo, { creaseAngle: 10 }, g);
      // PV field on the sloped upper surface (V, A, C), inset
      const pc = new THREE.Vector3().add(V).add(A).add(Cc).multiplyScalar(1 / 3);
      const shrink = (p, f) => new THREE.Vector3().lerpVectors(pc, p, f);
      const nrm = new THREE.Vector3().subVectors(A, V).cross(new THREE.Vector3().subVectors(Cc, V)).normalize();
      if (nrm.y < 0) nrm.negate();
      const a2 = shrink(V, 0.8).addScaledVector(nrm, 0.06), b2 = shrink(A, 0.8).addScaledVector(nrm, 0.06), c2 = shrink(Cc, 0.8).addScaledVector(nrm, 0.06);
      // only the upper two thirds carry panels
      const lo1 = new THREE.Vector3().lerpVectors(a2, c2, 0.3), lo2 = new THREE.Vector3().lerpVectors(b2, c2, 0.3);
      const pvGeo = new THREE.BufferGeometry();
      const Q = [];
      const t2 = (a, b, c) => Q.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const nn = new THREE.Vector3().subVectors(lo2, lo1).cross(new THREE.Vector3().subVectors(c2, lo1));
      if (nn.dot(nrm) > 0) t2(lo1, lo2, c2); else t2(lo1, c2, lo2);
      pvGeo.setAttribute('position', new THREE.Float32BufferAttribute(Q, 3));
      pvGeo.translate(-V.x, -V.y, -V.z);
      pvGeo.computeVertexNormals();
      const pvg = new THREE.Group();
      S.solid(pvGeo, { material: pvMat, edges: pvEdges, castShadow: false }, pvg);
      // module lines across the wing PV
      const ml = [];
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const p = new THREE.Vector3().lerpVectors(lo1, c2, t), q = new THREE.Vector3().lerpVectors(lo2, c2, t);
        ml.push(p.x - V.x, p.y - V.y + 0.01, p.z - V.z, q.x - V.x, q.y - V.y + 0.01, q.z - V.z);
      }
      S.lines(ml, { width: LW.hair, color: C.redDeep }, pvg);
      pvg.position.copy(V);
      pv.add(pvg);
      wingsPart.add(g);
      wings.push({ g, pvg });
    }
    // roof PV rows
    const rows = [];
    const ROWS = 11;
    for (let i = 0; i < ROWS; i++) {
      const z = -ROOF_HALF + 3.2 + i * ((2 * ROOF_HALF - 6.4) / (ROWS - 1));
      const g = new THREE.Group();
      const len = 2 * ROOF_HALF - 6.4;
      const row = S.solid(boxGeo(len, 0.12, 1.1, { center: true }), { material: pvMat, edges: pvEdges, castShadow: false }, g);
      row.rotation.x = -12 * DEG;
      const ml = [];
      for (let m = 1; m < 16; m++) { const x = -len / 2 + m * len / 16; ml.push(x, 0.07, -0.54, x, 0.07, 0.54); }
      const mods = S.lines(ml, { width: LW.hair, color: C.redDeep }, null);
      row.add(mods);
      g.position.set(0, H_CORE + ROOF_T + 0.5, z);
      pv.add(g);
      rows.push(g);
    }
    S.anim.prop('wings', 0, v => {
      wingsPart.visible = v > 0.001;
      wings.forEach(({ g, pvg }, i) => {
        const s = Math.max(0.0001, sub(v, i * 0.09, 0.73 + i * 0.09, ease.out));
        g.scale.setScalar(s);
        pvg.scale.setScalar(s);
      });
    }, { kind: 'reveal', dur: 1100 });
    S.anim.prop('pv', 0, v => {
      pv.visible = v > 0.001;
      rows.forEach((g, i) => {
        const s = sub(v, i * 0.045, 0.45 + i * 0.045, ease.out);
        g.scale.set(Math.max(0.0001, s), 1, 1);
        g.visible = s > 0.001;
      });
      wings.forEach(({ pvg }) => { pvg.visible = v > 0.35; setOpacity(pvg, sub(v, 0.35, 0.6)); });
    }, { kind: 'reveal', dur: 1100 });

    // ================= 5. geothermal loops (blue) =================
    const geoPart = S.part('Geothermal loops');
    const loops = [];
    const loopXZ = [[8.2, 14.6], [12.2, 10.6], [16.2, 6.6]];
    const loopTop = -PLATE_T - 0.4, loopBot = Y_BOT + 1.2;
    for (const [x, z] of loopXZ) {
      const g = new THREE.Group();
      g.position.set(x, loopTop, z);
      const dz = 0.55, depth = loopTop - loopBot;
      const seg = [0, 0, -dz, 0, -depth, -dz, 0, -depth, -dz, 0, -depth - 0.5, 0, 0, -depth - 0.5, 0, 0, -depth, dz, 0, -depth, dz, 0, 0, dz];
      S.lines(seg, { width: 1.5, color: C.blue }, g);
      geoPart.add(g);
      loops.push(g);
    }
    // header under the plate linking the loops
    const header = S.lines([5, loopTop, 5, 8.2, loopTop, 14.6 - 0.55, 5, loopTop, 5, 16.2, loopTop, 6.6 - 0.55, 8.2, loopTop, 14.6 - 0.55, 16.2, loopTop, 6.6 - 0.55], { width: 1.5, color: C.blue }, null);
    geoPart.add(header);
    S.anim.prop('geo', 0, v => {
      geoPart.visible = v > 0.001;
      header.material.setOpacity(sub(v, 0, 0.25));
      loops.forEach((g, i) => {
        const s = sub(v, 0.1 + i * 0.08, 0.75 + i * 0.08, ease.inOut);
        g.scale.y = Math.max(0.0001, s);
        g.visible = s > 0.001;
      });
    }, { kind: 'reveal', dur: 1200 });

    // ================= labels (one column, horizontal leaders) =================
    const COL = 790;
    const MAXW = 296;
    const lWaste = S.label({
      text: 'Old Nanjido landfill',
      anchor: new THREE.Vector3(W + 0.05, -6.2, -21), anchorObj: ground, place: { mode: 'column', x: COL },
    });
    // the right-most pile in the cut
    const pileR = pilePos.reduce((a, b) => (0.848 * b[0] - 0.53 * b[1] > 0.848 * a[0] - 0.53 * a[1] ? b : a));
    const lPiles = S.label({
      text: 'Piles reach solid ground',
      anchor: new THREE.Vector3(pileR[0] + 0.5, -8.2, pileR[1]),
      anchorObj: pilesPart, allow: [ground], place: { mode: 'column', x: COL },
    });
    const lStoreys = S.label({
      text: 'Three floors, turned 45°',
      anchor: new THREE.Vector3(ROOF_HALF, H_CORE + 0.2, -ROOF_HALF),
      anchorObj: bldg, place: { mode: 'column', x: COL, dy: 46, elbow: 34 }, maxWidth: MAXW, nowrap: false,
    });
    const lPV = S.label({
      text: 'Solar panels on the roof and wings',
      anchor: new THREE.Vector3(ROOF_HALF - 3.2 + 0.01, H_CORE + ROOF_T + 0.56, -ROOF_HALF + 3.2 + 2 * ((2 * ROOF_HALF - 6.4) / 10)),
      anchorObj: pv, allow: [bldg], place: { mode: 'column', x: COL, dy: -58, elbow: 46 }, leaderTone: 'red', maxWidth: MAXW, nowrap: false,
    });
    const lGeo = S.label({
      text: 'Geothermal heating and cooling',
      anchor: new THREE.Vector3(16.2 + 0.1, -10.5, 6.6 + 0.55), anchorObj: geoPart, allow: [ground], place: { mode: 'column', x: COL }, maxWidth: MAXW, nowrap: false,
      leaderTone: 'blue',
    });
    labelProp(S, 'L1', lWaste);
    labelProp(S, 'L2', lPiles);
    labelProp(S, 'L3', lStoreys);
    labelProp(S, 'L4', lPV);
    labelProp(S, 'L5', lGeo);

    const T = [
      { ground: 0, piles: 0, rise: 0, twist: 0, wings: 0, pv: 0, geo: 0 },
      { ground: 1 },
      { piles: 1 },
      { rise: 1, twist: 1 },
      { wings: 1, pv: 1 },
      { geo: 1 },
    ];
    const LBL = ['L1', 'L2', 'L3', 'L4', 'L5'];
    return {
      targets(n) {
        const out = {};
        for (let i = 0; i <= 5; i++) for (const k of Object.keys(T[i] || {})) if (k !== undefined) out[k] = 0;
        for (let i = 1; i <= n; i++) Object.assign(out, T[i]);
        LBL.forEach((l, i) => { out[l] = n >= i + 1 ? 1 : 0; });
        return out;
      },
      plan(name, from, to, dir, n) {
        if (dir < 0) return null;
        const seq = {
          piles: { delay: 0 },
          rise: { delay: 0 },
          twist: { delay: 950 },
          wings: { delay: 0 },
          pv: { delay: 650 },
          geo: { delay: 0 },
          L1: { delay: 1050 }, L2: { delay: 1550 }, L3: { delay: 2000 }, L4: { delay: 1900 }, L5: { delay: 1150 },
        };
        return seq[name] || null;
      },
    };
  },
});
