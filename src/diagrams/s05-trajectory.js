// s05-trajectory: Seoul's emissions path, 2005 to 2050, as a receding row of 46 bars (one per year) on a
// model base. Facts (dossier): 52.34 Mt CO2e in 2005 (baseline) · half (-50%) by 2033 · net zero by 2050.
// Between those milestones the heights are drawn linear, for illustration only (no extra numbers).
// 2005 to 2033 red (the cut Seoul has committed to), 2034 to 2049 muted white, 2050 = a footprint on the base.
// States: 0 the base with 46 hairline footprints · 1 the bars rise in sequence, then the three labels.
import { defineDiagram, THREE, C, LW, ease, sub, labelProp, boxGeo } from '../kit3d/index.js';

// ---- data ----
const Y0 = 2005, Y_HALF = 2033, Y1 = 2050;
const N = Y1 - Y0 + 1;                    // 46 bars
const MT0 = 52.34;
const mt = y => (y <= Y_HALF ? MT0 + (MT0 / 2 - MT0) * (y - Y0) / (Y_HALF - Y0)
  : (MT0 / 2) * (1 - (y - Y_HALF) / (Y1 - Y_HALF)));

// ---- model dimensions (m); 1 m of height = 1 Mt ----
const PITCH = 2.0;                        // one year
const BT = 0.72;                          // bar width along the row
const BD = 1.7;                           // bar depth
const BASE_H = 0.7;                       // model base
const BASE_X0 = -1.6, BASE_X1 = (N - 1) * PITCH + 1.6;
const BASE_Z = 2.3;                       // base half depth
const xOf = i => i * PITCH;

export default defineDiagram({
  id: 's05-trajectory',
  states: 1,
  region: { x: 100, y: 320, w: 840, h: 620 },
  stage: {
    view: { azimuth: -16, elevation: 27, target: [45, 0, 0], scale: 8.45, at: [420, 488] },
    shadowBox: { min: [BASE_X0, 0, -BASE_Z], max: [BASE_X1, MT0 + BASE_H, BASE_Z] },
    ground: false,
  },
  build(S) {
    // ---- base + footprints ----
    const base = S.part('Model base');
    const slab = S.solid(boxGeo(BASE_X1 - BASE_X0, BASE_H, 2 * BASE_Z), {}, base);
    slab.position.set((BASE_X0 + BASE_X1) / 2, 0, 0);
    const fy = BASE_H + 0.004;
    const fp = [];
    for (let i = 0; i < N - 1; i++) {
      const x0 = xOf(i) - BT / 2, x1 = xOf(i) + BT / 2, z0 = -BD / 2, z1 = BD / 2;
      fp.push(x0, fy, z0, x1, fy, z0, x1, fy, z0, x1, fy, z1, x1, fy, z1, x0, fy, z1, x0, fy, z1, x0, fy, z0);
    }
    S.lines(fp, { width: LW.hair, color: C.hair }, base);
    // 2050: net zero, the footprint alone, drawn in ink (part of the base)
    {
      const x0 = xOf(N - 1) - BT / 2, x1 = xOf(N - 1) + BT / 2, z0 = -BD / 2, z1 = BD / 2;
      S.lines([x0, fy, z0, x1, fy, z0, x1, fy, z0, x1, fy, z1, x1, fy, z1, x0, fy, z1, x0, fy, z1, x0, fy, z0],
        { width: 1.2, color: C.edge }, base);
    }

    // ---- bars ----
    const redPart = S.part('Bars 2005 to 2033');
    const greyPart = S.part('Bars 2034 to 2049');
    const redMat = S.material(C.red);
    const bars = [];
    for (let i = 0; i < N - 1; i++) {
      const y = Y0 + i;
      const h = mt(y);
      const isRed = y <= Y_HALF;
      const pivot = new THREE.Group();
      pivot.position.set(xOf(i), BASE_H, 0);
      (isRed ? redPart : greyPart).add(pivot);
      S.solid(boxGeo(BT, h, BD), isRed
        ? { material: redMat, castShadow: false, edges: { color: C.redDeep, color2: C.redDeep, width: 1.3, width2: 0.8 } }
        : { castShadow: false, edges: { color: C.crease, color2: C.hair, width: 1.15, width2: 0.7 } }, pivot);
      bars.push({ pivot, h });
    }

    // ---- labels (stepped above their anchors, vertical leaders) ----
    const LIFT = 44;      // px between an anchor and the bottom of its label
    const top05 = new THREE.Vector3(xOf(0), BASE_H + mt(Y0), 0);
    const top33 = new THREE.Vector3(xOf(Y_HALF - Y0), BASE_H + mt(Y_HALF), 0);
    const foot50 = new THREE.Vector3(xOf(N - 1), fy, BD / 2);     // front edge of the 2050 footprint
    const p05 = S.project(top05), p33 = S.project(top33), p50 = S.project(foot50);
    const lab05 = S.label({
      text: '52.34 Mt in 2005', anchor: top05, anchorObj: redPart,
      place: { mode: 'fixed', x: p05.x - 2, y: p05.y - LIFT, ax: 'left', ay: 'bottom' }, leader: 'v',
    });
    const lab33 = S.label({
      text: 'Half by 2033', anchor: top33, anchorObj: redPart,
      place: { mode: 'fixed', x: p33.x - 2, y: p33.y - LIFT, ax: 'left', ay: 'bottom' }, leader: 'v',
    });
    // 2050 sits at ground level: its label hangs below the base (the leader crosses only the base it marks)
    const pFront = S.project(new THREE.Vector3(xOf(N - 1), 0, BASE_Z));
    const lab50 = S.label({
      text: 'Net zero by 2050', anchor: foot50, anchorObj: base,
      place: { mode: 'fixed', x: p50.x + 2, y: pFront.y + 34, ax: 'right', ay: 'top' }, leader: 'v', dot: false,
    });

    // ---- motion: one progress prop, bars rise in a wave from 2005 to 2049 ----
    const SPREAD = 0.58, LEN = 0.42;
    S.anim.prop('rise', 0, v => {
      bars.forEach((b, i) => {
        const a = (i / (N - 2)) * SPREAD;
        const s = sub(v, a, a + LEN, ease.out);
        b.pivot.scale.y = Math.max(1e-3, s);
        b.pivot.visible = s > 0.002;
      });
    }, { kind: 'reveal', dur: 2300 });
    // labels follow their bars: 2005 settles at ~LEN, 2033 at ~(28/44·SPREAD + LEN), the row ends at 1
    labelProp(S, 'l05', lab05, { delay: 2300 * LEN * 0.9 });
    labelProp(S, 'l33', lab33, { delay: 2300 * ((Y_HALF - Y0) / (N - 2) * SPREAD + LEN) * 0.92 });
    labelProp(S, 'l50', lab50, { delay: 2300 * 0.96 });

    return {
      targets: n => ({ rise: n >= 1 ? 1 : 0, l05: n >= 1 ? 1 : 0, l33: n >= 1 ? 1 : 0, l50: n >= 1 ? 1 : 0 }),
      plan: (name, from, to, dir) => {
        if (name === 'rise') return dir > 0 ? { delay: 0, dur: 2300, ease: ease.linear } : { delay: 160, dur: 900, ease: ease.linear };
        if (dir < 0) return { delay: 0, dur: 280, ease: ease.in };
        return null;
      },
    };
  },
});
