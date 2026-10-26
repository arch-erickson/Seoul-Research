// s04-timeline: Seoul's two emergencies on one measured axis.
// A thin extruded rule (an architect's scale, one hairline tick per year) spans the full region, aligned with the
// headline's left and right edges. Four restrained markers (pucks) stand on it at their true year positions; each
// carries a stem that runs beside its label like a flag: years large, events small, alternating above and below.
// Facts (brief + dossier): 1978 Nanjido becomes the dump · 1993 dump closes · 2002 World Cup Park (blue) ·
// 2011 Fukushima and the Seoul blackout (red).
// States: 0 empty · 1 the rule draws in · 2 1978 + 1993 · 3 2002 + 2011.
import { defineDiagram, THREE, C, LW, ease, sub, boxGeo } from '../kit3d/index.js';

// ---- layout (region px) and model dimensions (world units: 1 unit = 1 year) ----
const W = 1720;
const Y_START = 1975, Y_END = 2026;          // the rule spans the full region width
const EDGE = 2;                              // px inset so the silhouette is not clipped at the region edge
const K = (W - 2 * EDGE) / (Y_END - Y_START); // px per year (= view scale)
const EL = 30;                               // camera elevation (deg)
const AY = 224;                              // screen y of the rule's top-face centreline
const D = 1.7, T = 0.36;                     // rule depth and thickness
const PR = 0.5, PH = 0.42;                   // puck radius and height
const X0 = Y_START - 1978;                   // world x of the rule's left end (x = 0 at 1978)
const L = Y_END - Y_START;
const xw = y => y - 1978;

// label metrics (Montserrat: ascent 0.968, descent 0.251, cap height 0.70)
const YEAR_SIZE = 56, YEAR_LH = 1.12, EVT_SIZE = 22;
const capTop = (size, lh) => ((lh - 1.219) / 2 + 0.968 - 0.70) * size;
const baseline = (size, lh) => ((lh - 1.219) / 2 + 0.968) * size;
const YEAR_BOX = YEAR_SIZE * YEAR_LH;
const EVT_BASE = YEAR_BOX + 3 + baseline(EVT_SIZE, 1.25);   // event baseline below the label top
const LABEL_H = YEAR_BOX + 3 + EVT_SIZE * 1.25;
const FLAG = 18;                              // px between a stem and its label
const CLEAR_UP = 56, CLEAR_DOWN = 50;         // px between the rule/puck and the nearest label edge

const EVENTS = [
  { year: 1978, text: 'Nanjido becomes Seoul’s main dump', up: true, tone: 'ink' },
  { year: 1993, text: 'Dump closes', up: false, tone: 'ink' },
  { year: 2002, text: 'Reopens as World Cup Park', up: true, tone: 'blue' },
  { year: 2011, text: 'Fukushima and a Seoul blackout', up: false, tone: 'red' },
];
const BEAT = [0, 0, 1, 1];                     // index within its beat (stagger)

const quadOut = t => 1 - (1 - t) * (1 - t);

export default defineDiagram({
  id: 's04-timeline',
  states: 3,
  region: { x: 100, y: 340, w: 1720, h: 500 },
  stage: {
    view: { azimuth: 0, elevation: EL, target: [0, T, 0], scale: K, at: [EDGE + (1978 - Y_START) * K, AY] },
    shadowBox: { min: [X0, 0, -D], max: [X0 + L, T + PH, D] },
    ground: false,
  },
  build(S) {
    const DEG = Math.PI / 180;
    const pxPerY = K * Math.cos(EL * DEG);

    // ================= the rule =================
    const axis = S.part('Timeline rule');
    const pivot = new THREE.Group();
    pivot.position.set(X0, 0, 0);
    axis.add(pivot);
    const bar = S.solid(boxGeo(L, T, D), { castShadow: false }, pivot);
    bar.position.set(L / 2, 0, 0);
    // one hairline tick per year from the front edge, longer every 5 and 10 years. Each tick is its own object and
    // appears the moment the rule's growing end passes it (no clipping planes: they are very slow on software GL).
    const ty = T + 0.003, zf = D / 2;
    const ticks = [];
    for (let y = Y_START + 1; y < Y_END; y++) {
      const len = y % 10 === 0 ? 0.62 * D : y % 5 === 0 ? 0.42 * D : 0.24 * D;
      const o = y % 10 === 0 ? { width: 0.8, color: C.crease } : { width: LW.hair, color: C.hair };
      ticks.push({ x: xw(y), obj: S.lines([xw(y), ty, zf, xw(y), ty, zf - len], o, axis) });
    }

    S.anim.prop('axis', 0, v => {
      const s = Math.max(1e-4, v);
      pivot.scale.x = s;
      axis.visible = v > 0.0005;
      const end = X0 + L * s;
      for (const t of ticks) t.obj.visible = t.x < end - 0.02;
    }, { kind: 'reveal', dur: 1050 });

    // ================= markers, stems and labels =================
    const items = EVENTS.map((e, i) => {
      const part = S.part(`${e.year} marker`);
      const x = xw(e.year);
      const tone = e.tone === 'red' ? { face: C.red, edge: C.redDeep, stem: C.red }
        : e.tone === 'blue' ? { face: C.blue, edge: C.blueDeep, stem: C.blue }
          : { face: C.model, edge: C.edge, stem: C.ink };
      // puck standing on the rule
      const pg = new THREE.Group();
      pg.position.set(x, T, 0);
      part.add(pg);
      const geo = new THREE.CylinderGeometry(PR, PR, PH, 72, 1).translate(0, PH / 2, 0);
      S.solid(geo, e.tone === 'ink' ? {} : { color: tone.face, edges: { color: tone.edge, color2: tone.edge } }, pg);

      // stem + label (flag style: the label hangs beside the stem, the stem spans the label's height).
      // Up stems rise from the puck's centre; down stems start at the puck's front foot, run over the rule's top
      // and front faces like a highlighted graduation, then drop to the label. The pieces grow one after another
      // at one screen speed, so the whole stem draws as a single stroke.
      const foot = e.up ? new THREE.Vector3(x, T + PH, 0) : new THREE.Vector3(x, 0, D / 2);
      const px = S.project(foot).x;
      let top, yEnd;
      if (e.up) {
        const puckTop = S.project(new THREE.Vector3(x, T + PH, -PR)).y;   // back rim of the puck
        top = Math.round(puckTop - CLEAR_UP - LABEL_H);
        yEnd = top + capTop(YEAR_SIZE, YEAR_LH);                           // stem ends at the year's cap height
      } else {
        const ruleBot = S.project(new THREE.Vector3(x, 0, D / 2)).y;
        top = Math.round(ruleBot + CLEAR_DOWN);
        yEnd = top + EVT_BASE;                                             // stem ends at the event's baseline
      }
      const len = Math.abs(yEnd - S.project(foot).y) / pxPerY;
      const E = 0.006;
      const strong = e.tone !== 'ink';
      const lo = { width: strong ? 1.5 : 1.1, color: tone.stem };
      // pieces: [group, axis to scale, screen length px]
      const pieces = [];
      const piece = (pos, seg, ax, px) => {
        const g = new THREE.Group();
        g.position.set(...pos);
        part.add(g);
        S.lines([0, 0, 0, ...seg], lo, g);
        pieces.push({ g, ax, px });
      };
      if (e.up) piece([x, T + PH, 0], [0, len, 0], 'y', len * pxPerY);
      else {
        piece([x, T + E, PR], [0, 0, D / 2 + E - PR], 'z', (D / 2 - PR) * K * Math.sin(EL * DEG));
        piece([x, T + E, D / 2 + E], [0, -T - E, 0], 'y', T * pxPerY);
        piece([x, 0, D / 2 + E], [0, -len, 0], 'y', len * pxPerY);
      }
      const total = pieces.reduce((a, p) => a + p.px, 0);
      const setStem = k => {        // k: 0..1 drawn fraction of the whole stroke, in screen length
        let d = k * total;
        for (const p of pieces) {
          const f = Math.max(0, Math.min(1, d / p.px));
          d -= p.px;
          p.g.scale[p.ax] = Math.max(1e-4, f);
          p.g.visible = f > 0.001;
        }
      };

      const lab = S.label({
        text: String(e.year), sub: e.text,
        size: YEAR_SIZE, weight: 800, lineHeight: YEAR_LH, tone: e.tone,
        subSize: EVT_SIZE, subWeight: 500, subTone: 'ink',
        place: { mode: 'fixed', x: Math.round(px + FLAG), y: top, ax: 'left', ay: 'top' }, leader: false,
      });
      return { e, part, pg, setStem, lab, top };
    });

    // one progress per event: puck grows, stem draws outward, then the label settles beside it
    const SLIDE = 8;
    items.forEach((it, i) => {
      const dir = it.e.up ? 1 : -1;
      S.anim.prop('e' + i, 0, v => {
        it.part.visible = v > 0.0005;
        const s = sub(v, 0, 0.36, ease.out);
        it.pg.scale.set(Math.max(1e-4, s), Math.max(1e-4, s), Math.max(1e-4, s));
        it.pg.visible = s > 0.001;
        it.setStem(sub(v, 0.24, 0.62, ease.out));
        const lv = sub(v, 0.56, 1, ease.out);
        it.lab.o.place.y = it.top + dir * (1 - lv) * SLIDE;
        it.lab.setOpacity(lv, 0);
      }, { kind: 'reveal', dur: 1300 });
    });

    return {
      targets: n => ({
        axis: n >= 1 ? 1 : 0,
        e0: n >= 2 ? 1 : 0, e1: n >= 2 ? 1 : 0,
        e2: n >= 3 ? 1 : 0, e3: n >= 3 ? 1 : 0,
      }),
      plan(name, from, to, dir, n, prev) {
        if (name === 'axis') {
          return dir > 0 ? { delay: 0, dur: 1050, ease: quadOut } : { delay: prev >= 2 ? 520 : 0, dur: 760, ease: ease.in };
        }
        const i = +name.slice(1);
        if (dir > 0) {
          // markers wait for the rule when several beats are played at once
          let delay = BEAT[i] * 90;
          if (prev < 1) delay += 900;
          if (prev < 2 && i >= 2) delay += 700;
          return { delay, dur: 1300, ease: ease.linear };
        }
        // backward: later events leave first
        let delay = (1 - BEAT[i]) * 70;
        if (n < 2 && prev >= 3 && i < 2) delay += 260;
        return { delay, dur: 900, ease: ease.linear };
      },
    };
  },
});
