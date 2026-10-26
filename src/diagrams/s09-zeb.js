// s09-zeb: the ZEB ladder. Korea's Zero Energy Building certificate grades a building by the share of its
// energy it makes itself: Grade 5 = 20 to 40%, Grade 1 = over 100% (grades 4 to 2 carry no numbers: not confirmed).
// Five white building masses step up left to right (Grade 5 -> Grade 1), each two floors taller than the last,
// with solar panel coverage growing one strip per grade until the Grade 1 roof is fully covered (red).
// States: 0 empty · 1 the ladder rises, panels laid, labels + axis · 2 Grade 5 outlined red: the 2025 private mandate.
import {
  defineDiagram, THREE, C, LW, ease, sub, labelProp, setOpacity, boxGeo,
} from '../kit3d/index.js';

const DEG = Math.PI / 180;

// ---- dimensions (m) ----
const BW = 14;            // building width (local x)
const BD = 11;            // building depth (local z)
const FLOOR = 3.6;
const FLOORS = [3, 5, 7, 9, 11];          // Grade 5 .. Grade 1
const PITCH = 22;
const YAW = 32 * DEG;     // every mass turned so its front and left faces show
const XS = [-2, -1, 0, 1, 2].map(i => i * PITCH);
const GRADES = ['Grade 5: 20 to 40%', 'Grade 4', 'Grade 3', 'Grade 2', 'Grade 1: over 100%'];

// solar strips: run front to back on the roof, filling from the left edge
const PV_MARGIN = 0.6, PV_GAP = 0.45, PV_N = 5;
const PV_W = (BW - 2 * PV_MARGIN - (PV_N - 1) * PV_GAP) / PV_N;
const PV_L = BD - 2 * PV_MARGIN;
const PV_T = 0.16, PV_LIFT = 0.22;
const PV_CELL = 1.6;

const AXIS_Z = 34;        // the axis arrow runs on the ground in front of the label row
const AXIS_X0 = XS[0] - 8, AXIS_X1 = XS[4] + 9;

// ---- motion (ms). Masters run linear; every sub-part carries its own ease-out window, so a backward
// (linear) playback gives each part a true ease-in departure. ----
const RISE = 1150, R_STEP = 80, R_LEN = 830;            // each mass rises over 830 ms, 80 ms apart
const PV_DELAY = 600, PV_DUR = 1010, PV_LEN = 450;      // each strip is laid over 450 ms
const PV_STEP_ROOF = 80, PV_STEP_STRIP = 60;            // 80 ms between roofs, 60 ms between strips
const AXIS_DELAY = 700, AXIS_DUR = 900;

export default defineDiagram({
  id: 's09-zeb',
  states: 2,
  region: { x: 100, y: 320, w: 860, h: 620 },
  stage: {
    view: { azimuth: 0, elevation: 30, target: [0, 0, 0], scale: 7.4, at: [430, 372] },
    shadowBox: { min: [-56, 0, -14], max: [56, 41, 14] },
    ground: false,
  },
  build(S) {
    const blds = [];
    const ink = new THREE.Color(C.edge), crease = new THREE.Color(C.crease), red = new THREE.Color(C.red);

    FLOORS.forEach((nf, i) => {
      const H = nf * FLOOR;
      const root = S.part(GRADES[i].split(':')[0] + ' building');
      root.position.set(XS[i], 0, 0);
      root.rotation.y = YAW;
      // the mass (scaled for the rise)
      const mass = new THREE.Group();
      root.add(mass);
      const box = S.solid(boxGeo(BW, H, BD), {}, mass);
      // floor lines on the two visible faces stay at their true heights (not scaled with the mass) and are
      // revealed by a world clipping plane that follows the rising roof, so floors stack instead of squeezing
      const floorClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), H);
      const fl = [];
      for (let k = 1; k < nf; k++) {
        const y = k * FLOOR;
        fl.push(-BW / 2, y, BD / 2, BW / 2, y, BD / 2);     // front face
        fl.push(-BW / 2, y, BD / 2, -BW / 2, y, -BD / 2);   // left face
      }
      S.lines(fl, { width: LW.hair, color: C.hair, clippingPlanes: [floorClip] }, root);

      // solar strips (own part, rides on the roof)
      const pvPart = S.part(i === 4 ? 'Grade 1 solar panels' : GRADES[i].split(':')[0] + ' solar panels', root);
      const strips = [];
      const nStrips = i + 1;
      const isRed = i === 4;
      const pvMat = S.material(isRed ? C.red : '#F2F1EE');
      for (let k = 0; k < nStrips; k++) {
        const x = -BW / 2 + PV_MARGIN + PV_W / 2 + k * (PV_W + PV_GAP);
        const pivot = new THREE.Group();            // pivot on the back edge so the strip is laid front-wards
        pivot.position.set(x, 0, -PV_L / 2);
        pvPart.add(pivot);
        const g = new THREE.BoxGeometry(PV_W, PV_T, PV_L).translate(0, PV_LIFT + PV_T / 2, PV_L / 2);
        S.solid(g, {
          material: pvMat, castShadow: false,
          edges: isRed ? { color: C.redDeep, color2: C.redDeep, width: 0.9, width2: 0.8 } : { color: C.crease, color2: C.crease, width: 0.9, width2: 0.8 },
        }, pivot);
        // hairline cell grid on the top face
        const yT = PV_LIFT + PV_T + 0.005;
        const seg = [0, yT, 0.15, 0, yT, PV_L - 0.15];
        for (let c = 1; c * PV_CELL < PV_L - 0.2; c++) seg.push(-PV_W / 2 + 0.04, yT, c * PV_CELL, PV_W / 2 - 0.04, yT, c * PV_CELL);
        const grid = S.lines(seg, { width: LW.hair, color: isRed ? C.redDeep : C.hair }, pivot);
        strips.push({ pivot, grid });
      }
      blds.push({ root, mass, box, H, pvPart, strips, floorClip });
    });

    // ---- axis arrow (ground, in front of the label row) ----
    const axis = S.part('Axis arrow');
    const shaft = new THREE.Group();
    shaft.position.set(AXIS_X0, 0, AXIS_Z);
    axis.add(shaft);
    S.lines([0, 0, 0, AXIS_X1 - AXIS_X0 - 0.4, 0, 0], { width: LW.crease, color: C.ink }, shaft);
    const head = new THREE.Group();
    axis.add(head);
    const hl = 1.9, hw = 1.0 / Math.cos(30 * DEG);
    S.lines([0, 0, 0, -hl, hw, 0, 0, 0, 0, -hl, -hw, 0], { width: LW.crease, color: C.ink }, head);

    // ---- labels ----
    const gradeLabels = GRADES.map((t, i) => S.label({
      text: t, anchor: new THREE.Vector3(XS[i], 0, 0), anchorObj: blds[i].root,
      place: { mode: 'offset', dx: 0, dy: 46, ax: 'center', ay: 'top' },
      nowrap: i % 4 !== 0, maxWidth: i % 4 === 0 ? 124 : null,
    }));
    const capLabel = S.label({
      text: 'Share of energy the building makes itself', size: 18, weight: 500, tone: 'muted',
      anchor: new THREE.Vector3(AXIS_X1, 0, AXIS_Z), place: { mode: 'offset', dx: 0, dy: 16, ax: 'right', ay: 'top' },
    });
    const g5Top = new THREE.Vector3();
    const mandate = S.label({
      // ink leader: the slide's rollout list already shows 2025 in red, so the diagram keeps its two reds
      // (Grade 1 panels, Grade 5 outline)
      text: 'Required for new private buildings from 2025', leaderTone: 'ink',
      anchor: () => g5Top.set(XS[0], blds[0].H, 0), anchorObj: blds[0].root,
      place: { mode: 'fixed', x: 37, y: 125, ax: 'left', ay: 'top' }, leader: 'v',
      nowrap: false, maxWidth: 300,
    });

    // ---- animator props ----
    S.anim.prop('rise', 0, v => {
      blds.forEach((b, i) => {
        const a = i * R_STEP / RISE;
        const s = sub(v, a, a + R_LEN / RISE, ease.out);
        b.mass.scale.y = Math.max(1e-3, s);
        b.mass.visible = s > 0.002;
        b.pvPart.position.y = b.H * s;
        b.floorClip.constant = b.H * s - 0.25;     // a floor line shows once the roof is 0.25 m above it
      });
    }, { kind: 'reveal', dur: RISE });
    S.anim.prop('pv', 0, v => {
      blds.forEach((b, i) => {
        b.strips.forEach((st, k) => {
          const a = (PV_STEP_ROOF * i + PV_STEP_STRIP * k) / PV_DUR;
          const s = sub(v, a, a + PV_LEN / PV_DUR, ease.out);
          st.pivot.scale.z = Math.max(1e-3, s);
          st.pivot.visible = s > 0.002;
          st.grid.material.setOpacity(sub(s, 0.5, 1));   // cell grid only over the second half of the lay
        });
      });
    }, { kind: 'reveal', dur: PV_DUR, delay: PV_DELAY });
    S.anim.prop('axis', 0, v => {
      const s = ease.inOutSine(v);
      shaft.scale.x = Math.max(1e-3, s);
      shaft.visible = s > 0.002;
      head.position.set(AXIS_X0 + (AXIS_X1 - AXIS_X0) * s, 0, AXIS_Z);
      head.scale.setScalar(Math.max(1e-3, sub(s, 0, 0.06)));   // the chevron grows, no pop
      head.visible = s > 0.002;
    }, { kind: 'reveal', dur: AXIS_DUR, delay: AXIS_DELAY });
    gradeLabels.forEach((l, i) => labelProp(S, 'lab' + i, l, { delay: 1350 + i * 75 }));
    labelProp(S, 'cap', capLabel, { delay: 1750 });
    // state 2: Grade 5 outline turns red
    const g5Lines = blds[0].box.userData.lines.material;
    S.anim.prop('mandate', 0, v => {
      g5Lines.uniforms.uColorA.value.copy(ink).lerp(red, v);
      g5Lines.uniforms.uColorB.value.copy(crease).lerp(red, v);
      g5Lines.uniforms.uWidthA.value = LW.silhouette + 0.6 * v;
      g5Lines.uniforms.uWidthB.value = LW.crease + 0.9 * v;
    }, { kind: 'reveal', dur: 700 });
    labelProp(S, 'mandateLab', mandate, { delay: 600 });

    return {
      targets: n => {
        const t = { rise: n >= 1 ? 1 : 0, pv: n >= 1 ? 1 : 0, axis: n >= 1 ? 1 : 0, cap: n >= 1 ? 1 : 0,
          mandate: n >= 2 ? 1 : 0, mandateLab: n >= 2 ? 1 : 0 };
        gradeLabels.forEach((_, i) => { t['lab' + i] = n >= 1 ? 1 : 0; });
        return t;
      },
      plan: (name, from, to, dir) => {
        if (dir > 0) {
          // the masters run linear: each building, strip and the arrow carry their own easing inside apply()
          if (name === 'rise' || name === 'pv' || name === 'axis') return { ease: ease.linear };
          if (name === 'mandate') return { dur: 800, ease: ease.inOut };
          return null;
        }
        // backwards: labels leave first, then the arrow and the panels, then the masses sink (Grade 1 first).
        // A linear master played back through ease-out windows gives every part an ease-in departure.
        if (name.startsWith('lab') || name === 'cap' || name === 'mandateLab') return { delay: 0, dur: 400, ease: ease.in };
        if (name === 'axis') return { delay: 100, dur: 700, ease: ease.linear };
        if (name === 'pv') return { delay: 100, dur: 900, ease: ease.linear };
        if (name === 'rise') return { delay: 600, dur: 900, ease: ease.linear };
        if (name === 'mandate') return { delay: 0, dur: 500, ease: ease.inOut };
        return null;
      },
    };
  },
});
