// s13-rfid: the RFID food-waste unit of a Korean apartment complex, as a white study model.
// Facts (brief §7 / dossier §4.2): a resident taps an RFID household card, the shared bin opens, a load cell
// weighs the deposit, and the household is billed by weight. "4.2 kg" is the brief's illustrative reading.
// Model: a boxy cabinet with a sloped control head (card reader, indicator, display) and a top lid. The front
// door is left off so the inner bin (drawn in section) and the weighing plate under it can be seen. To the right,
// a small apartment slab is the "household" that receives the charge line.
// States: 1 TAP (card meets the reader, indicator red) · 2 WEIGH (lid opens, bag drops, weighing plate red,
// display "4.2 kg") · 3 BILL (lid closes, a red charge line runs to one apartment, which turns red).
import {
  defineDiagram, THREE, C, LW, ease, sub, labelProp, setOpacity,
} from '../kit3d/index.js';

const DEG = Math.PI / 180;
const AZ = 30, EL = 26;
// screen-right on the ground plane: a 3D line along it reads exactly horizontal on screen
const RIGHT = new THREE.Vector3(Math.cos(AZ * DEG), 0, -Math.sin(AZ * DEG));

// ---- the unit (metres) ----
const HW = 0.32;            // half width (x)
const HD = 0.35;            // half depth (z); front = +z
const WALL = 0.03;          // cabinet wall
const Y_HEAD = 0.88;        // underside of the control head
const Y_TOP = 1.18;         // top of the head
const Z_SLOPE = 0.19;       // the sloped front panel runs from (z=HD, Y_HEAD) up to (z=Z_SLOPE, Y_TOP)
const TILT = Math.atan2(HD - Z_SLOPE, Y_TOP - Y_HEAD);
const HOLE = { x: 0.165, z0: -0.25, z1: 0.07 };           // input opening through the head
const LID = { x: 0.19, z0: -0.27, z1: 0.09, t: 0.018, open: 56 * DEG };
const PLATE = { x: 0.25, y0: 0.03, y: 0.075, z0: -0.31, z1: 0.52 };   // weighing plate on load cells, protrudes in front
const BIN = { x: 0.205, lip: 0.018, y0: PLATE.y, y1: 0.76, t: 0.026, zb: -0.29, zc: 0.05 };   // inner bin, cut at zc
// panel-local layout: u along x, v up the slope from its lower edge, n out of the panel
const DISP = { u0: -0.075, u1: 0.265, v0: 0.075, v1: 0.272, n: 0.012 };
const PAD = { u0: -0.29, u1: -0.15, v0: 0.075, v1: 0.215, n: 0.009 };
const LED = { u0: -0.29, u1: -0.15, v0: 0.232, v1: 0.27, n: 0.009 };
const CARD = { w: 0.15, h: 0.095, t: 0.004, u: -0.287, v: 0.146, n: 0.026 };

// ---- the household (an apartment slab at model scale) ----
const LINE = { y: 1.03, z: 0.02, len: 1.5 };   // charge line: from the head's right face, along RIGHT
const AP = { bays: 4, bw: 0.18, floors: 10, d: 0.24, hhBay: 1 };
AP.fh = LINE.y / 8.5;                         // floor 8 (0-based) is centred on the charge line
AP.h = AP.floors * AP.fh;
AP.hhFloor = 8;

function boxAt(x0, x1, y0, y1, z0, z1) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
function rectLoop(x0, y0, x1, y1, z) {
  return [x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z];
}

export default defineDiagram({
  id: 's13-rfid',
  states: 3,
  region: { x: 100, y: 410, w: 1240, h: 450 },
  stage: {
    view: { azimuth: AZ, elevation: EL, target: [0, 0, 0], scale: 246, at: [450, 370] },
    shadowBox: { min: [-0.6, 0, -1.2], max: [2.4, 1.6, 0.6] },
    ground: { y: 0, opacity: 0.07 },   // lighter cast shadows: keep the white-model look
  },
  build(S) {
    const white = S.material(C.model);
    const cutMat = S.material(C.modelCut);
    const thin = { width: 1.2, width2: 0.8 };

    // ================= cabinet: the front door is left off and the front of the right wall is cut away
    // on the same section plane as the inner bin (z = BIN.zc), so the bin, the bag and the plate can be seen.
    const cab = S.part('Cabinet');
    S.solid(boxAt(-HW, -HW + WALL, 0, Y_HEAD, -HD, HD), {}, cab);                         // left wall
    S.solid(boxAt(-HW + WALL, HW - WALL, 0, Y_HEAD, -HD, -HD + WALL), {}, cab);            // back wall
    S.solid(boxAt(HW - WALL, HW, 0, Y_HEAD, -HD, BIN.zc), { material: [white, white, white, white, cutMat, white] }, cab);   // right wall, cut

    // ================= control head: sloped front panel, input opening on top =================
    const head = S.part('Head');
    {
      const sh = new THREE.Shape();
      sh.moveTo(-HW, -HD); sh.lineTo(HW, -HD); sh.lineTo(HW, HD); sh.lineTo(-HW, HD); sh.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-HOLE.x, -HOLE.z1); hole.lineTo(HOLE.x, -HOLE.z1); hole.lineTo(HOLE.x, -HOLE.z0); hole.lineTo(-HOLE.x, -HOLE.z0); hole.closePath();
      sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: Y_TOP - Y_HEAD, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, Y_HEAD, 0);
      // shear the front face back into the sloped control panel
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getZ(i) > HD - 1e-6 && p.getY(i) > Y_HEAD + 1e-6) p.setZ(i, Z_SLOPE);
      }
      g.computeVertexNormals();
      S.solid(g, {}, head);
    }
    // the panel frame: origin at the panel's lower front edge, +y up the slope, +z out of the panel
    const panel = new THREE.Group();
    panel.position.set(0, Y_HEAD, HD);
    panel.rotation.x = -TILT;
    S.world.add(panel);
    const onPanel = (r, parent, o = {}) => S.solid(boxAt(r.u0, r.u1, r.v0, r.v1, 0, r.n), Object.assign({ edges: thin }, o), parent);

    // card reader pad with a hairline contactless mark, and the indicator strip above it
    const readerPart = S.part('Card reader', panel);
    onPanel(PAD, readerPart);
    {
      const cx = (PAD.u0 + PAD.u1) / 2 - 0.022, cy = (PAD.v0 + PAD.v1) / 2;
      const seg = [];
      for (const r of [0.022, 0.038, 0.054]) {
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a0 = -0.75 + 1.5 * i / n, a1 = -0.75 + 1.5 * (i + 1) / n;
          seg.push(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, PAD.n + 0.001, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, PAD.n + 0.001);
        }
      }
      S.lines(seg, { width: LW.hair, color: C.hair }, readerPart);
    }
    const ledPart = S.part('Reader light', panel);
    const ledMat = S.material(C.model, { unique: true });
    const led = onPanel(LED, ledPart, { material: ledMat });

    // display: a raised bezel with a hairline glass line inside; the reading is a DOM label on its face
    const dispPart = S.part('Display', panel);
    onPanel(DISP, dispPart);
    S.lines(rectLoop(DISP.u0 + 0.016, DISP.v0 + 0.016, DISP.u1 - 0.016, DISP.v1 - 0.016, DISP.n + 0.001), { width: LW.hair, color: C.hair }, dispPart);

    // lid, hinged at its back edge
    const lidPart = S.part('Lid');
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, Y_TOP, LID.z0);
    lidPart.add(lidPivot);
    S.solid(boxAt(-LID.x, LID.x, 0, LID.t, 0, LID.z1 - LID.z0), {}, lidPivot);

    // ================= weighing plate (load cell) and the inner bin in section =================
    const platePart = S.part('Weighing plate');
    const plateMat = S.material(C.model, { unique: true });
    const plate = S.solid(boxAt(-PLATE.x, PLATE.x, PLATE.y0, PLATE.y, PLATE.z0, PLATE.z1), { material: plateMat }, platePart);
    // four load cells under the plate's corners
    for (const sx of [-1, 1]) for (const [z0, z1] of [[PLATE.z1 - 0.075, PLATE.z1 - 0.025], [PLATE.z0 + 0.025, PLATE.z0 + 0.075]]) {
      const xa = sx * (PLATE.x - 0.025), xb = sx * (PLATE.x - 0.085);
      S.solid(boxAt(Math.min(xa, xb), Math.max(xa, xb), 0, PLATE.y0, z0, z1), { edges: thin }, platePart);
    }

    const bin = S.part('Inner bin');
    {
      // U-shaped cross-section (walls, floor and top lip) extruded from the back wall to the cut plane
      const b = BIN, L = b.lip;
      const prof = [
        [-b.x, b.y0], [b.x, b.y0], [b.x, b.y1 - 0.035], [b.x + L, b.y1 - 0.035], [b.x + L, b.y1], [b.x - b.t, b.y1],
        [b.x - b.t, b.y0 + b.t], [-b.x + b.t, b.y0 + b.t], [-b.x + b.t, b.y1], [-b.x - L, b.y1], [-b.x - L, b.y1 - 0.035], [-b.x, b.y1 - 0.035],
      ];
      const sh = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
      const zf = b.zb + b.t;
      const g = new THREE.ExtrudeGeometry(sh, { depth: b.zc - zf, bevelEnabled: false });
      g.translate(0, 0, zf);
      g.computeVertexNormals();
      S.solid(g, { material: [cutMat, white] }, bin);      // caps = cut faces (poché), sides = white
      S.solid(boxAt(-b.x, b.x, b.y0, b.y1, b.zb, zf), {}, bin);   // back wall
      S.solid(boxAt(-b.x - L, b.x + L, b.y1 - 0.035, b.y1, b.zb - L, b.zb), {}, bin);   // back lip
    }

    // the bag of food waste: a lathed sack with a tied neck
    const bagPart = S.part('Bag');
    const bagPivot = new THREE.Group();
    bagPart.add(bagPivot);
    {
      const prof = [
        [0.0, 0.0], [0.07, 0.004], [0.112, 0.022], [0.136, 0.058], [0.143, 0.1], [0.134, 0.142],
        [0.106, 0.18], [0.066, 0.206], [0.033, 0.22], [0.025, 0.232], [0.04, 0.254], [0.048, 0.27], [0.029, 0.281], [0.0, 0.284],
      ].map(([r, y]) => new THREE.Vector2(r * 0.94, y * 0.98));
      const g = new THREE.LatheGeometry(prof, 40);
      g.scale(1.04, 1, 0.9);
      g.computeVertexNormals();
      S.solid(g, { creaseAngle: 36 }, bagPivot);
    }
    const BAG_LAND = new THREE.Vector3(-0.035, BIN.y0 + BIN.t, -0.125);
    const BAG_TOP = new THREE.Vector3(-0.035, Y_TOP + 0.03, -0.09);

    // ================= the household card =================
    const cardPart = S.part('Card', panel);
    const cardG = new THREE.Group();
    cardPart.add(cardG);
    {
      const w = CARD.w, h = CARD.h, r = 0.009;
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
      sh.lineTo(w / 2, h / 2 - r); sh.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
      sh.lineTo(-w / 2 + r, h / 2); sh.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
      sh.lineTo(-w / 2, -h / 2 + r); sh.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
      const g = new THREE.ExtrudeGeometry(sh, { depth: CARD.t, bevelEnabled: false, curveSegments: 4 });
      g.translate(0, 0, -CARD.t / 2);
      g.computeVertexNormals();
      S.solid(g, { edges: { width: 1.3, width2: 0.8 } }, cardG);
      // chip
      const cx0 = -w / 2 + 0.022, cy0 = -0.012;
      S.lines(rectLoop(cx0, cy0, cx0 + 0.028, cy0 + 0.022, CARD.t / 2 + 0.0008), { width: LW.hair, color: C.hair }, cardG);
    }
    const CARD_AT = new THREE.Vector3(CARD.u, CARD.v, CARD.n);
    const CARD_FROM = new THREE.Vector3(CARD.u - 0.36, CARD.v - 0.12, CARD.n + 0.30);

    // ================= the household: an apartment slab =================
    const lineStart = new THREE.Vector3(HW, LINE.y, LINE.z);
    const lineEnd = lineStart.clone().addScaledVector(RIGHT, LINE.len);
    const zF = lineEnd.z;                                     // front face of the slab
    const ax0 = lineEnd.x - (AP.hhBay + 0.5) * AP.bw;
    const ax1 = ax0 + AP.bays * AP.bw;
    const zB = zF - AP.d;
    const apt = S.part('Apartment');
    S.solid(boxAt(ax0, ax1, 0, AP.h, zB, zF), {}, apt);
    S.solid(boxAt(ax1 - 0.27, ax1 - 0.09, AP.h, AP.h + 0.075, zB + 0.06, zF - 0.09), { edges: thin }, apt);   // roof core
    {
      const seg = [];
      const e = 0.0015;
      for (let k = 1; k < AP.floors; k++) {
        const y = k * AP.fh;
        seg.push(ax0, y, zF + e, ax1, y, zF + e);
        seg.push(ax1 + e, y, zF, ax1 + e, y, zB);
      }
      for (let k = 1; k < AP.bays; k++) {
        const x = ax0 + k * AP.bw;
        seg.push(x, AP.fh, zF + e, x, AP.h, zF + e);
      }
      S.lines(seg, { width: LW.hair, color: C.hair }, apt);
    }
    const hhPart = S.part('Household');
    const hhMat = S.material(C.model, { unique: true });
    const hy0 = AP.hhFloor * AP.fh, hx0 = ax0 + AP.hhBay * AP.bw;
    const hhG = new THREE.Group();
    hhG.position.set(hx0 + AP.bw / 2, hy0 + AP.fh / 2, zF);
    hhPart.add(hhG);
    const hhW = AP.bw - 0.04, hhH = AP.fh - 0.034;
    const hh = S.solid(boxAt(-hhW / 2, hhW / 2, -hhH / 2, hhH / 2, 0, 0.008), { material: hhMat, edges: thin }, hhG);

    // charge line: drawn from the unit's side to the household, horizontal on screen
    const linePart = S.part('Charge line');
    const lineG = new THREE.Group();
    lineG.position.copy(lineStart);
    lineG.rotation.y = AZ * DEG;
    linePart.add(lineG);
    S.lines([0, 0, 0, LINE.len, 0, 0], { width: 2.2, color: C.red }, lineG);
    // a small node where the line leaves the unit (a flat disc facing the camera)
    const node = new THREE.Mesh(new THREE.CircleGeometry(0.014, 28), new THREE.MeshBasicMaterial({ color: C.red, toneMapped: false }));
    node.position.copy(lineStart);
    node.lookAt(lineStart.clone().add(new THREE.Vector3(Math.cos(EL * DEG) * Math.sin(AZ * DEG), Math.sin(EL * DEG), Math.cos(EL * DEG) * Math.cos(AZ * DEG))));
    node.position.x += 0.004;
    linePart.add(node);

    // ================= state =================
    const P = { tap: 0, weigh: 0, bill: 0 };
    const cW = new THREE.Color(C.model), cR = new THREE.Color(C.red);
    const inkA = new THREE.Color(C.edge), inkB = new THREE.Color(C.crease), deep = new THREE.Color(C.redDeep);
    function tint(solid, mat, k) {
      mat.color.copy(cW).lerp(cR, k);
      const u = solid.userData.lines.material.uniforms;
      u.uColorA.value.copy(inkA).lerp(deep, k);
      u.uColorB.value.copy(inkB).lerp(deep, k);
    }
    function refresh() {
      const { tap, weigh, bill } = P;
      // TAP: the card glides in and meets the reader; the reader light turns red
      const c = sub(tap, 0, 0.66, ease.out);
      cardG.position.lerpVectors(CARD_FROM, CARD_AT, c);
      setOpacity(cardPart, sub(tap, 0, 0.28));
      tint(led, ledMat, sub(tap, 0.6, 0.82, ease.inOut) * (1 - sub(weigh, 0, 0.16, ease.inOut)));
      // WEIGH: the lid opens, the bag drops into the bin, the weighing plate turns red
      const lid = sub(weigh, 0.02, 0.26, ease.inOut) * (1 - sub(bill, 0, 0.3, ease.inOut));
      lidPivot.rotation.x = -LID.open * lid;
      const appear = sub(weigh, 0.18, 0.32, ease.out);
      const fall = sub(weigh, 0.3, 0.62, ease.in);
      bagPivot.position.lerpVectors(BAG_TOP, BAG_LAND, fall);
      bagPivot.scale.setScalar(Math.max(1e-3, appear));
      bagPart.visible = appear > 0.001;
      tint(plate, plateMat, sub(weigh, 0.62, 0.82, ease.inOut) * (1 - sub(bill, 0, 0.24, ease.inOut)));
      // BILL: the charge line runs to the household, which turns red
      const run = sub(bill, 0.16, 0.66, ease.inOut);
      lineG.scale.x = Math.max(1e-4, run);
      node.scale.setScalar(Math.max(1e-3, sub(bill, 0.1, 0.2, ease.out)));
      linePart.visible = bill > 0.1;
      const hk = sub(bill, 0.6, 0.84, ease.out);
      hhG.scale.set(Math.max(1e-3, hk), Math.max(1e-3, hk), 1);
      hhPart.visible = hk > 0.001;
      tint(hh, hhMat, 1);
    }
    for (const name of ['tap', 'weigh', 'bill']) S.anim.prop(name, 0, v => { P[name] = v; refresh(); }, { kind: 'move', dur: 1200 });

    // ================= labels =================
    const COL = 292;   // right edge of the left label column (design px)
    const labTap = S.label({
      text: 'Tap your card',
      anchor: v => { cardG.updateWorldMatrix(true, false); return v.set(-CARD.w / 2, 0, CARD.t / 2).applyMatrix4(cardG.matrixWorld); },
      anchorObj: cardPart, place: { mode: 'column', x: COL, side: 'left' },
    });
    const labWeigh = S.label({
      text: 'The bin weighs it',
      anchor: new THREE.Vector3(-PLATE.x + 0.035, PLATE.y0 + 0.01, PLATE.z1),
      anchorObj: platePart, place: { mode: 'column', x: COL, side: 'left' },
    });
    const dispMid = new THREE.Vector3((DISP.u0 + DISP.u1) / 2, (DISP.v0 + DISP.v1) / 2, DISP.n);
    const labKg = S.label({
      text: '4.2 kg', size: 19, weight: 700, lineHeight: 1.0,
      anchor: v => { panel.updateWorldMatrix(true, false); return v.copy(dispMid).applyMatrix4(panel.matrixWorld); },
      allow: [dispPart], place: { mode: 'offset', dx: 0, dy: 0, ax: 'center', ay: 'middle' },
    });
    {
      // lay the reading onto the display plane: map the text's x / y axes to the panel's u / -v directions on screen
      panel.updateWorldMatrix(true, false);
      const o = S.project(dispMid.clone().applyMatrix4(panel.matrixWorld));
      const pu = S.project(dispMid.clone().add(new THREE.Vector3(0.1, 0, 0)).applyMatrix4(panel.matrixWorld));
      const pv = S.project(dispMid.clone().add(new THREE.Vector3(0, -0.1, 0)).applyMatrix4(panel.matrixWorld));
      const ux = pu.x - o.x, uy = pu.y - o.y, vx = pv.x - o.x, vy = pv.y - o.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      labKg.nameEl.style.transformOrigin = '50% 50%';
      labKg.nameEl.style.transform = `matrix(${(ux / lu).toFixed(4)},${(uy / lu).toFixed(4)},${(vx / lv).toFixed(4)},${(vy / lv).toFixed(4)},0,0)`;
    }
    // "You pay by weight": centred over the free run of the charge line, between the head and the slab
    const freeL = S.project(new THREE.Vector3(HW, Y_TOP, -HD)).x;
    const freeR = S.project(new THREE.Vector3(ax0, LINE.y, zF)).x;
    const lineY = S.project(lineStart).y;
    const labPay = S.label({
      text: 'You pay by weight', anchor: lineStart, anchorObj: linePart,
      place: { mode: 'fixed', x: (freeL + freeR) / 2, y: lineY - 14, ax: 'center', ay: 'bottom' }, leader: false,
    });
    labelProp(S, 'labTap', labTap);
    labelProp(S, 'labWeigh', labWeigh);
    labelProp(S, 'labKg', labKg, { slide: 0 });
    labelProp(S, 'labPay', labPay);

    const DUR = { tap: 1150, weigh: 1700, bill: 1300 };
    const LABEL_DELAY = { labTap: 820, labKg: 1300, labWeigh: 1420, labPay: 900 };
    return {
      targets: n => ({
        tap: n >= 1 ? 1 : 0, weigh: n >= 2 ? 1 : 0, bill: n >= 3 ? 1 : 0,
        labTap: n >= 1 ? 1 : 0, labWeigh: n >= 2 ? 1 : 0, labKg: n >= 2 ? 1 : 0, labPay: n >= 3 ? 1 : 0,
      }),
      plan: (name, from, to, dir) => {
        if (name in P) return dir > 0 ? { delay: 0, dur: DUR[name], ease: ease.linear } : { delay: 160, dur: 820, ease: ease.linear };
        return dir > 0 ? { delay: LABEL_DELAY[name] ?? 800, dur: 520 } : { delay: 0, dur: 240 };
      },
    };
  },
});
