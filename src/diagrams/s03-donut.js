// s03-donut: Seoul's greenhouse gas by sector as a thick ring chart at an axonometric tilt.
// Dossier: buildings = 67% of city GHG; buildings + transportation = 85%, so transportation 18% and waste
// and other 15%. Buildings is the red segment and stands slightly taller than the two light segments.
// The slide's HTML legend (right of the region) names the three sectors; the diagram only carries "67%" and
// "BUILDINGS" inside the ring's opening (on the ground, in clear space).
// States: 0 empty · 1 the ring sweeps in clockwise from 12 o'clock (buildings, transportation, waste and other),
// then the buildings segment rises; "67%" and "BUILDINGS" settle in the opening.
import { defineDiagram, THREE, C, ease, sub, extractEdges } from '../kit3d/index.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

const DEG = Math.PI / 180;

// ---- ring (units) ----
const RO = 10;             // outer radius
const RI = 6.9;            // inner radius (the opening holds the big number)
const H0 = 2.2;            // extrusion of the two light segments
const H1 = 3.2;            // buildings: slightly raised
const GAP = 0.3;           // parallel slot between segments
const START = -12 * DEG;   // angles run clockwise seen from above, 0 = 12 o'clock (the back)
const STEP = 1.2 * DEG;    // arc sampling
const SEGS = [
  { name: 'Buildings 67%', share: 0.67, color: C.red, edges: { color: C.redDeep, color2: C.redDeep }, h: H1 },
  { name: 'Transportation 18%', share: 0.18, color: C.model, h: H0 },
  { name: 'Waste and other 15%', share: 0.15, color: '#E2E1DD', h: H0 },
];

// ---- motion (ms, before the kit's global time scale). The masters run linear; easing lives inside apply(),
// so a backward (linear) playback gives every part a true ease-in departure. ----
const SWEEP = 1100;                       // one continuous clockwise sweep, ease-out (sine)
const RISE_DELAY = 1000, RISE = 650;      // the red segment rises last
const LAB_DELAY = 1560, LAB_STEP = 80, LAB_DUR = 560;
const LAB_DRIFT = 7;                      // px the words rise while fading in

const easeOutSine = t => Math.sin(t * Math.PI / 2);

// ---- geometry: an annular sector with parallel slots, rewritten in place while it sweeps ----
// point at clockwise angle phi (from -z) and radius r
const P = (phi, r, y) => [r * Math.sin(phi), y, -r * Math.cos(phi)];
const TAN = phi => [Math.cos(phi), 0, Math.sin(phi)];     // clockwise tangent
const RAD = phi => [Math.sin(phi), 0, -Math.cos(phi)];    // outward radial

function sectorGeometry(n) {
  const count = 24 * n + 12;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  return g;
}

// Writes the solid between boundary angles a..b (b >= a), height h, with n arc steps.
// At radius r the solid spans [a + d(r), b - d(r)], d(r) = asin(GAP/2 / r): the slots keep a constant width.
function writeSector(g, n, a, b, h) {
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  let i = 0;
  const put = (p, q) => { pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2]; nrm[i] = q[0]; nrm[i + 1] = q[1]; nrm[i + 2] = q[2]; i += 3; };
  const tri = (p0, p1, p2, n0, n1, n2, ref) => {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * ref[0] + cy * ref[1] + cz * ref[2] < 0) { put(p0, n0); put(p2, n2); put(p1, n1); }
    else { put(p0, n0); put(p1, n1); put(p2, n2); }
  };
  const quad = (p0, p1, p2, p3, n0, n1, n2, n3, ref) => { tri(p0, p1, p2, n0, n1, n2, ref); tri(p0, p2, p3, n0, n2, n3, ref); };
  const dI = Math.asin(GAP / 2 / RI), dO = Math.asin(GAP / 2 / RO);
  const iA = a + dI, iB = Math.max(iA, b - dI);
  const oA = a + dO, oB = Math.max(oA, b - dO);
  const fi = k => iA + (iB - iA) * k / n, fo = k => oA + (oB - oA) * k / n;
  const UP = [0, 1, 0], DN = [0, -1, 0];
  for (let k = 0; k < n; k++) {
    const i0 = fi(k), i1 = fi(k + 1), o0 = fo(k), o1 = fo(k + 1);
    // top + bottom caps
    quad(P(i0, RI, h), P(o0, RO, h), P(o1, RO, h), P(i1, RI, h), UP, UP, UP, UP, UP);
    quad(P(i0, RI, 0), P(o0, RO, 0), P(o1, RO, 0), P(i1, RI, 0), DN, DN, DN, DN, DN);
    // outer wall (smooth radial normals)
    const ro0 = RAD(o0), ro1 = RAD(o1), rom = RAD((o0 + o1) / 2);
    quad(P(o0, RO, 0), P(o1, RO, 0), P(o1, RO, h), P(o0, RO, h), ro0, ro1, ro1, ro0, rom);
    // inner wall
    const ri0 = RAD(i0).map(v => -v), ri1 = RAD(i1).map(v => -v), rim = RAD((i0 + i1) / 2).map(v => -v);
    quad(P(i0, RI, 0), P(i1, RI, 0), P(i1, RI, h), P(i0, RI, h), ri0, ri1, ri1, ri0, rim);
  }
  // end faces: flat normals perpendicular to the end line, facing away from the solid
  const endFace = (pi, po, dirRef) => {
    const ex = po[0] - pi[0], ez = po[2] - pi[2];
    let nx = ez, nz = -ex;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    if (nx * dirRef[0] + nz * dirRef[2] < 0) { nx = -nx; nz = -nz; }
    const N = [nx, 0, nz];
    quad([pi[0], 0, pi[2]], [po[0], 0, po[2]], [po[0], h, po[2]], [pi[0], h, pi[2]], N, N, N, N, N);
  };
  const ta = TAN(a), tb = TAN(b);
  endFace(P(iA, RI, 0), P(oA, RO, 0), [-ta[0], 0, -ta[2]]);
  endFace(P(iB, RI, 0), P(oB, RO, 0), tb);
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
}

// Same attribute layout as the kit's edgeLinesFromGeometry, so the ink shader draws creases and silhouettes.
function edgeGeometry(geo) {
  const e = extractEdges(geo, 28);
  const g = new LineSegmentsGeometry();
  g.setPositions(e.positions.length ? e.positions : new Float32Array(6));
  g.setAttribute('instanceNA', new THREE.InstancedBufferAttribute(e.na.length ? e.na : new Float32Array(3), 3));
  g.setAttribute('instanceNB', new THREE.InstancedBufferAttribute(e.nb.length ? e.nb : new Float32Array(3), 3));
  g.setAttribute('instanceKind', new THREE.InstancedBufferAttribute(e.kind.length ? e.kind : new Float32Array([-1]), 1));
  if (!e.positions.length) g.instanceCount = 0;
  return g;
}

export default defineDiagram({
  id: 's03-donut',
  states: 1,
  region: { x: 110, y: 400, w: 540, h: 500 },
  stage: {
    view: { azimuth: 0, elevation: 46, target: [0, 0, 0], scale: 22, at: [262, 276] },
    shadowBox: { min: [-11, 0, -11], max: [11, 4, 11] },
    ground: { opacity: 0.1 },
  },
  build(S) {
    // ---- segments ----
    let a = START;
    const segs = SEGS.map(sd => {
      const span = sd.share * Math.PI * 2;
      const n = Math.max(8, Math.ceil(span / STEP));
      const part = S.part(sd.name);
      const geo = sectorGeometry(n);
      const grp = S.solid(geo, { color: sd.color, edges: sd.edges }, part);
      grp.userData.mesh.frustumCulled = false;
      const sg = { a, b: a + span, n, h: sd.h, part, grp, geo, lines: grp.userData.lines, cur: null };
      a += span;
      return sg;
    });
    const red = segs[0];
    const minExt = 2 * Math.asin(GAP / 2 / RO) + 1e-4;
    const setHead = head => {
      for (const sg of segs) {
        const b = Math.min(sg.b, head);
        const on = b - sg.a > minExt;
        sg.part.visible = on;
        if (!on || sg.cur === b) continue;
        sg.cur = b;
        writeSector(sg.geo, sg.n, sg.a, b, sg.h);
        const old = sg.lines.geometry;
        sg.lines.geometry = edgeGeometry(sg.geo);
        old.dispose();
      }
    };

    // ---- words in the opening ----
    // The clear floor of the opening runs from the far inner wall's foot down to the near (red) rim, so its
    // middle is the projection of the axis point at half the red height.
    const mid = new THREE.Vector3(0, H1 / 2, 0);
    const GAPW = 2;               // px between the number and its caption
    const INK = -4;               // the number's line box carries more air above the digits than below
    const big = S.label({
      text: '67%', size: 88, weight: 800, lineHeight: 1.0, tone: 'ink', anchor: mid,
      place: { mode: 'offset', dx: 0, dy: 0, ax: 'center', ay: 'bottom' },
    });
    big.nameEl.style.letterSpacing = '-0.03em';
    const cap = S.label({
      text: 'BUILDINGS', size: 18, weight: 600, caps: true, tone: 'muted', lineHeight: 1.2, anchor: mid,
      place: { mode: 'offset', dx: 0, dy: 0, ax: 'center', ay: 'top' },
    });
    cap.nameEl.style.paddingLeft = '0.12em';   // balance the trailing tracking so the caps sit centred
    // centre the two-line block on the opening
    const layout = () => {
      big.measure(); cap.measure();
      const total = big.h + GAPW + cap.h;
      big.base = INK - total / 2 + big.h;           // bottom of the number
      cap.base = INK - total / 2 + big.h + GAPW;     // top of the caption
    };
    layout();
    S.labels.remeasure = function () { for (const l of this.labels) l.measure(); layout(); this.update(); };
    const wordProp = (name, l, delay) => S.anim.prop(name, 0, v => {
      l.o.place.dy = l.base + (1 - v) * LAB_DRIFT;
      l.setOpacity(v, 0);
    }, { kind: 'fade', dur: LAB_DUR, delay });

    // ---- animator props ----
    S.anim.prop('sweep', 0, v => setHead(START + Math.PI * 2 * easeOutSine(v)), { kind: 'reveal', dur: SWEEP });
    S.anim.prop('rise', 0, v => {
      red.grp.scale.y = (H0 + (H1 - H0) * ease.out(v)) / H1;
    }, { kind: 'reveal', dur: RISE, delay: RISE_DELAY });
    wordProp('lab67', big, LAB_DELAY);
    wordProp('labCap', cap, LAB_DELAY + LAB_STEP);

    return {
      targets: n => {
        const on = n >= 1 ? 1 : 0;
        return { sweep: on, rise: on, lab67: on, labCap: on };
      },
      plan: (name, from, to, dir) => {
        if (dir > 0) {
          if (name === 'sweep' || name === 'rise') return { ease: ease.linear };
          return null;
        }
        // backwards: the words leave first, the red segment sinks, then the ring unwinds to 12 o'clock
        if (name === 'labCap') return { delay: 0, dur: 360, ease: ease.in };
        if (name === 'lab67') return { delay: 60, dur: 360, ease: ease.in };
        if (name === 'rise') return { delay: 220, dur: 520, ease: ease.linear };
        if (name === 'sweep') return { delay: 560, dur: 850, ease: ease.linear };
        return null;
      },
    };
  },
});
