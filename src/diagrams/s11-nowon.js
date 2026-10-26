// s11-nowon: Nowon EZ House as an exploded axonometric (diagram-design "type-exploded" grammar).
// Five parts bottom -> top, one equal explode gap, nothing rotates, one label column with horizontal leaders:
//   Geothermal field (blue) · Structure · Passive House envelope · Heat recovery ventilation · Solar panels (red, focal)
// States
//   0  nothing (the assembled block is built but hidden)
//   1  the block rises out of its site plate, then lifts apart top part first; each label fades in after its part settles
//   2  labels fade, the parts settle back into one ordinary-looking mid-rise block (camera eases in on it)
import {
  defineDiagram, THREE, C, LW, ease, sub, lerp, labelProp, boxGeo, prismGeo, rectPts,
} from '../kit3d/index.js';

// ---------------------------------------------------------------- model dimensions (metres)
const GAP = 8;                               // the one explode gap between every pair of parts
const NF = 5, FL = 3.0, SLAB = 0.3;          // five storeys, 3 m floor to floor
const BL = 54, BD = 12, WALL = 0.6;         // envelope outer footprint (long axis = x, south = +z)
const IL = BL - 2 * WALL, ID = BD - 2 * WALL; // the structure fits exactly inside the envelope
const H_STR = NF * FL + SLAB;                // top of the roof slab
const H_ENV = H_STR + 0.6;                   // envelope incl. parapet
const PL = BL + 3.4, PD = BD + 3.4, PT = 0.7; // site plate of the geothermal field
const PROBE = 6.5;                           // drawn depth of the boreholes (schematic)
// rooftop heat recovery: one unit at each end of the roof, joined by a supply + exhaust duct pair
// running along the south parapet (the two air streams that cross inside each unit)
const UW = 3.6, UH = 2.1, UZ0 = -1.6, UZ1 = 5.15;
const UNIT_X = IL / 2 - 0.55 - UW / 2;       // unit centres at +-UNIT_X
const DUCT_Z = [4.65, 3.8], DUCT_W = 0.6, DUCT_Y0 = 0.3, DUCT_H = 0.6;
// solar panels: three south-facing rows between the two units
const PV_TILT = 25 * Math.PI / 180, PV_RD = 2.0, PV_X1 = UNIT_X - UW / 2 - 1.6, PV_X0 = -PV_X1;
const PV_ROWS = [2.0, -1.25, -4.5];          // row centres (z), front to back
const PV_HF = 0.3, PV_T = 0.1;
const PV_HB = PV_HF + PV_RD * Math.tan(PV_TILT);

// assembled base heights and exploded lifts (one equal gap between solid bodies)
const ASM = { str: PT, env: PT, mv: PT + H_STR, pv: PT + H_STR };
const EXP = {};
EXP.str = PT + GAP;
EXP.env = EXP.str + H_STR + GAP;
EXP.mv = EXP.env + H_ENV + GAP;
EXP.pv = EXP.mv + UH + GAP;

const LABEL_W = 318;   // widest label (fixed so the layout never depends on font-load timing)
const LEAD = 44;       // shortest leader run from the model's right extreme to the column

// extrude a profile drawn in the (z, y) plane along x from x0 to x1
function profileX(profile, x0, x1) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  g.computeVertexNormals();
  return g;
}

const loop = (pts) => {             // closed polyline of [x,y,z] -> segments
  const out = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; out.push(...p, ...q); }
  return out;
};

export default defineDiagram({
  id: 's11-nowon',
  states: 2,
  region: { x: 100, y: 320, w: 900, h: 620 },
  stage: {
    view: { azimuth: 26, elevation: 28, target: [0, 0, 0], scale: 7.5, at: [300, 470] },
    // no contact shadows (exploded-view grammar) and no part receives shadows, so the shadow map is skipped
    // entirely (saves GPU work on the presentation laptop); the site plate grounds the block
    shadows: false,
    ground: false,
  },
  build(stage) {
    const W = stage.W, H = stage.H;
    const model = new THREE.Group();
    stage.world.add(model);
    // smaller polygon offset than the kit default: at ~7 px/m the default pushes a roof face back ~0.4 m,
    // which lets edges just under a slab (wall tops) show through it
    const OFS = { offsetFactor: 0.7, offsetUnits: 1.5 };
    const solid = (geo, parent, o = {}) => stage.solid(geo, Object.assign({ receiveShadow: false }, o,
      o.material ? {} : { material: stage.material(o.color || C.model, OFS) }), parent);
    const marker = (parent, x, y, z) => { const m = new THREE.Object3D(); m.position.set(x, y, z); parent.add(m); return m; };

    // ---------------------------------------------------------- 1 Geothermal field: site plate + borehole field (blue)
    const geo = stage.part('Geothermal field', model);
    solid(boxGeo(PL, PT, PD), geo);
    const probes = new THREE.Group();
    geo.add(probes);
    const probeSegs = [];
    const NX = 12, NZ = 3, SX = 4.4, SZ = 4.2;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const x = (i - (NX - 1) / 2) * SX, z = (j - (NZ - 1) / 2) * SZ;
      probeSegs.push(x, 0, z, x, -PROBE, z);
    }
    stage.lines(probeSegs, { width: 1.2, color: C.blue }, probes);
    const geoAnchor = marker(geo, PL / 2, PT / 2, -PD / 2);

    // ---------------------------------------------------------- 2 Structure: floor slabs + cross walls
    const str = stage.part('Structure', model);
    for (let i = 0; i <= NF; i++) solid(boxGeo(IL, SLAB, ID), str).position.y = i * FL;
    const WT = 0.25, WIN = 0.35, NW = 7;
    for (let k = 0; k < NW; k++) {
      const x = -IL / 2 + WT / 2 + k * ((IL - WT) / (NW - 1));
      solid(boxGeo(WT, NF * FL, ID - 2 * WIN), str).position.x = x;      // stops under the roof slab
    }
    const strAnchor = marker(str, IL / 2, (H_STR) / 2, -(ID / 2 - WIN));

    // ---------------------------------------------------------- 3 Passive House envelope: thick insulated sleeve + windows
    const env = stage.part('Passive House envelope', model);
    solid(prismGeo(rectPts(BL, BD), H_ENV, 0, { holes: [rectPts(IL, ID)] }), env);
    const win = [];
    const NB = 12, bay = BL / NB, ww = 2.5, wh = 1.6;
    for (let f = 0; f < NF; f++) {
      const y0 = f * FL + SLAB + 0.85, y1 = y0 + wh;
      for (let b = 0; b < NB; b++) {
        const cx = -BL / 2 + bay * (b + 0.5), z = BD / 2 + 0.01;
        win.push(...loop([[cx - ww / 2, y0, z], [cx + ww / 2, y0, z], [cx + ww / 2, y1, z], [cx - ww / 2, y1, z]]));
      }
      for (const cz of [-2.4, 2.4]) {
        const x = BL / 2 + 0.01, hw = 0.8;
        win.push(...loop([[x, y0, cz - hw], [x, y0, cz + hw], [x, y1, cz + hw], [x, y1, cz - hw]]));
      }
    }
    stage.lines(win, { width: 0.7, color: C.hair }, env);
    const envAnchor = marker(env, BL / 2, H_ENV / 2, -BD / 2);

    // ---------------------------------------------------------- 4 Heat recovery ventilation: rooftop units, main duct, risers
    const mv = stage.part('Heat recovery ventilation', model);
    const xs = [];
    const UD = UZ1 - UZ0, UZC = (UZ0 + UZ1) / 2;
    for (const ux of [-UNIT_X, UNIT_X]) {
      solid(boxGeo(UW, UH, UD), mv).position.set(ux, 0, UZC);
      const i = 0.45;   // heat-exchanger cross on the top face
      xs.push(ux - UW / 2 + i, UH + 0.005, UZ0 + i, ux + UW / 2 - i, UH + 0.005, UZ1 - i);
      xs.push(ux - UW / 2 + i, UH + 0.005, UZ1 - i, ux + UW / 2 - i, UH + 0.005, UZ0 + i);
    }
    const ductL = 2 * UNIT_X;
    for (const dz of DUCT_Z) solid(boxGeo(ductL, DUCT_H, DUCT_W), mv).position.set(0, DUCT_Y0, dz);
    stage.lines(xs, { width: LW.hair, color: C.crease }, mv);
    const mvAnchor = marker(mv, UNIT_X + UW / 2, UH / 2, UZ0);

    // ---------------------------------------------------------- 5 Solar panels (focal, red)
    const pv = stage.part('Solar panels', model);
    const mods = [];
    for (const zc of PV_ROWS) {
      const zf = zc + PV_RD / 2, zb = zc - PV_RD / 2;
      solid(profileX([[zf, 0], [zb, 0], [zb, PV_HB], [zf, PV_HF]], PV_X0, PV_X1), pv);
      solid(profileX([[zf, PV_HF], [zb, PV_HB], [zb, PV_HB + PV_T], [zf, PV_HF + PV_T]], PV_X0, PV_X1), pv,
        { color: C.red, edges: { color: C.redDeep, color2: C.redDeep } });
      for (let x = PV_X0 + 2; x < PV_X1 - 0.01; x += 2) mods.push(x, PV_HF + PV_T + 0.005, zf, x, PV_HB + PV_T + 0.005, zb);
    }
    stage.lines(mods, { width: 0.6, color: C.redDeep }, pv);
    const pvAnchor = marker(pv, PV_X1, PV_HB + PV_T, PV_ROWS[2] - PV_RD / 2);   // back row, top right

    // ---------------------------------------------------------- pose: explode progress b, settle progress c
    const parts = [
      { g: str, asm: ASM.str, exp: EXP.str },
      { g: env, asm: ASM.env, exp: EXP.env },
      { g: mv, asm: ASM.mv, exp: EXP.mv },
      { g: pv, asm: ASM.pv, exp: EXP.pv },
    ];
    let B = 0, K = 0;
    let F1 = null, F2 = null;       // camera framings: exploded, assembled
    const view = stage.view;
    function pose(b, c) {
      model.visible = b > 0.0005;
      model.scale.y = Math.max(1e-3, sub(b, 0, 0.26, ease.out));
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const top = parts.length - 1 - i;                       // explode: the top part lifts first
        const a = 0.24 + 0.07 * top;
        const up = sub(b, a, a + 0.44, ease.inOut);
        const ca = 0.1 + 0.07 * i;                              // settle: the bottom part lands first
        const down = sub(c, ca, ca + 0.52, ease.inOut);
        p.g.position.y = lerp(p.asm, p.exp, up * (1 - down));
      }
      const pr = sub(b, 0.55, 0.92, ease.out) * (1 - sub(c, 0, 0.42, ease.in));
      probes.scale.y = Math.max(1e-3, pr);
      probes.visible = pr > 0.002;
      if (F1 && F2) {
        // While the parts settle the camera follows the shrinking stack: blend from the exploded framing (F1,
        // model left of the label column) to a centred fit of the model as it is right now, capped at the final
        // framing F2. Every intermediate framing contains the whole model, so nothing is ever cropped.
        let F = F1;
        if (c > 0 && model.visible) {
          const Fd = fitCentred(extents(), F2.s);
          const k = sub(c, 0, 0.35, ease.inOut);
          F = { s: lerp(F1.s, Fd.s, k), at: [lerp(F1.at[0], Fd.at[0], k), lerp(F1.at[1], Fd.at[1], k)] };
        }
        view.scale = F.s;
        view.at = F.at;
        stage.applyView();
      }
    }
    const MX2 = 84, MY2 = 110, MY1 = 30;   // margins: assembled framing (x, y), exploded framing (y)
    function fitCentred(e, cap) {
      const s = Math.min(cap, (W - 2 * MX2) / (e.r1 - e.r0), (H - 2 * MY1) / (e.u1 - e.u0));
      return { s, at: [W / 2 - s * (e.r0 + e.r1) / 2, H / 2 + s * (e.u0 + e.u1) / 2] };
    }

    // ---------------------------------------------------------- framing (computed from the geometry)
    const DEG = Math.PI / 180;
    const az = view.azimuth * DEG, el = view.elevation * DEG;
    const R = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const U = new THREE.Vector3(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
    const v = new THREE.Vector3();
    function extents() {
      model.updateMatrixWorld(true);
      const e = { r0: 1e9, r1: -1e9, u0: 1e9, u1: -1e9 };
      const add = (p) => {
        const r = p.dot(R), u = p.dot(U);
        e.r0 = Math.min(e.r0, r); e.r1 = Math.max(e.r1, r); e.u0 = Math.min(e.u0, u); e.u1 = Math.max(e.u1, u);
      };
      model.traverse(o => {
        if (!o.visible) return;
        if (o.isMesh) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) add(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
        }
      });
      if (probes.visible) for (let i = 0; i < probeSegs.length; i += 3) add(v.set(probeSegs[i], probeSegs[i + 1] * probes.scale.y, probeSegs[i + 2]));
      return e;
    }

    // ---------------------------------------------------------- labels (one column, horizontal leaders)
    const col = { mode: 'column', x: 600 };
    const labPV = stage.label({ text: 'Solar panels', sub: '1,300 to 1,800 panels', subTone: 'red', leaderTone: 'red',
      anchor: pvAnchor, anchorObj: pv, place: col });
    const labMV = stage.label({ text: 'Heat recovery ventilation', anchor: mvAnchor, anchorObj: mv, place: col });
    const labEnv = stage.label({ text: 'Passive House envelope', sub: 'Insulation, airtight layer, triple glazing',
      anchor: envAnchor, anchorObj: env, place: col });
    const labStr = stage.label({ text: 'Structure', anchor: strAnchor, anchorObj: str, place: col });
    const labGeo = stage.label({ text: 'Geothermal field', sub: 'About 130 heat pumps', subTone: 'blue', leaderTone: 'blue',
      anchor: geoAnchor, anchorObj: geo, place: col });
    const labs = [labPV, labMV, labEnv, labStr, labGeo];

    // exploded framing: model + leaders + label column centred together, the model filling the height
    pose(1, 0);
    {
      const e = extents();
      const top = MY1, bot = H - MY1;
      const s = (bot - top) / (e.u1 - e.u0);
      const total = (e.r1 - e.r0) * s + LEAD + LABEL_W;
      const left = Math.round((W - total) / 2);
      F1 = { s, at: [left - s * e.r0, top + s * e.u1] };
      col.x = Math.round(left + (e.r1 - e.r0) * s + LEAD);
    }
    // assembled framing: the block alone, centred and larger
    pose(1, 1);
    {
      const e = extents();
      const s = Math.min((W - 2 * MX2) / (e.r1 - e.r0), (H - 2 * MY2) / (e.u1 - e.u0));
      F2 = fitCentred(e, s);
    }

    stage.anim.prop('explode', 0, x => { B = x; pose(B, K); }, { kind: 'move', dur: 2200 });
    stage.anim.prop('settle', 0, x => { K = x; pose(B, K); }, { kind: 'move', dur: 1700 });
    labs.forEach((l, i) => labelProp(stage, 'lab' + i, l));

    // label i fades in once its part has settled: solar panels (top) first ... geothermal field last
    const D1 = 2200;
    const settleAt = [0.68, 0.75, 0.82, 0.89, 0.93].map(f => Math.round(f * D1));
    return {
      targets: n => {
        const t = { explode: n >= 1 ? 1 : 0, settle: n >= 2 ? 1 : 0 };
        labs.forEach((l, i) => { t['lab' + i] = n === 1 ? 1 : 0; });
        return t;
      },
      plan: (name, from, to, dir, n, prev) => {
        if (name === 'explode') return dir > 0 ? { delay: 0, dur: D1, ease: ease.linear } : { delay: 240, dur: 1500, ease: ease.linear };
        if (name === 'settle') return dir > 0 ? { delay: 240, dur: 1700, ease: ease.linear } : { delay: 0, dur: 1600, ease: ease.linear };
        if (name.startsWith('lab')) {
          const i = +name.slice(3);
          if (to < from) return { delay: i * 40, dur: 280, ease: ease.in };
          if (prev === 0) return { delay: settleAt[i], dur: 520, ease: ease.out };
          return { delay: 1560 + i * 75, dur: 520, ease: ease.out };     // re-explode from state 2
        }
        return null;
      },
    };
  },
});
