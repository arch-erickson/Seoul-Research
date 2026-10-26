// s18-buslane: Seoul's median bus lanes (2004 bus reform), section axonometric of one arterial block at a stop.
// The street is cut at both ends like a study-model section (the +x cut face is shown as poche): sidewalks, two
// general lanes each way, raised island bus stops with shelters, and the two bus lanes in the middle of the road.
// Korea drives on the right and bus doors are on the right, so each island sits on the outer side of its bus lane.
// A blue main-route bus pulls into its stop on the near side, a green local bus waits at the far stop; cars are
// small white models in the curb lanes. The four-colour route key is the one place red/yellow/green swatches appear.
// States: 0 empty, 1 street + islands + buses + labels + key.
// Build (0 to 1): the strips extrude from the left cut, the middle strip leading; rails, shelters and cars rise as
// the street passes; the buses glide in through the cut ends and brake to rest; then the labels and the key.
import {
  defineDiagram, THREE, C, LW, FONT, ease, sub, lerp, labelProp,
  boxGeo,
} from '../kit3d/index.js';

// ---- dimensions (m): street along x, cross-section across z (+z = near side, toward the viewer) ----
const X0 = -18, X1 = 18;            // block cut at both ends
const T = 1.2;                      // slab depth shown in the section cut
const Z = {
  swN: [12.6, 15.6], genN: [6.2, 12.6], islN: [3.3, 6.2], bus: [-3.3, 3.3],
  islF: [-6.2, -3.3], genF: [-12.6, -6.2], swF: [-15.6, -12.6],
};
const H_SW = 0.15, H_ISL = 0.35;
const GREEN = '#3A9F35', GREEN_DEEP = '#1E5B1B', GREEN_LINE = '#B3DCAD';
const BLUE_LINE = '#9AB3DA';
const YELLOW = '#EDB21C';
const BUS_Z = 1.65;                  // lane centres (near lane +, far lane -)
const BLUE_REST = -9, GREEN_REST = 9.4;
const BUS_HALF = 6;
const outQuad = t => 1 - (1 - t) * (1 - t);     // gentler ease-out for the buses: cruise in, brake, no long creep
const WHEELS = [3.5, -2.8];          // axle positions, local x (front = +x)

// strip of the section block: z range, top height (bottom at -T), full block length
function stripGeo(z, top) {
  const g = boxGeo(X1 - X0, top + T, z[1] - z[0]);
  g.translate((X0 + X1) / 2, -T, (z[0] + z[1]) / 2);
  return g;
}

// bus body: side profile (x, y) extruded across z, small chamfer on the roof edges at both ends
function busGeo(len = 12, h = 3.2, w = 2.5, lift = 0.42) {
  const s = new THREE.Shape();
  const a = len / 2, c = 0.3;
  s.moveTo(-a, lift); s.lineTo(a, lift); s.lineTo(a, h - c); s.lineTo(a - c * 0.8, h); s.lineTo(-a + c * 0.8, h); s.lineTo(-a, h - c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  return g;
}

// small sedan: side profile extruded across its width (front at +x)
function carGeo() {
  const s = new THREE.Shape();
  const p = [[-2.25, 0.28], [2.25, 0.28], [2.3, 0.72], [1.25, 0.86], [0.55, 1.38], [-1.0, 1.4], [-1.75, 0.98], [-2.3, 0.88]];
  s.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: false });
  g.translate(0, 0, -0.9);
  return g;
}

export default defineDiagram({
  id: 's18-buslane',
  states: 1,
  region: { x: 100, y: 330, w: 800, h: 300 },
  stage: {
    view: { azimuth: 26, elevation: 29, target: [0, 0, 0], scale: 11.2, at: [262, 143] },
    shadowBox: { min: [-18.5, -1.2, -16], max: [18.5, 3.6, 16] },
    ground: false,
  },
  build(stage) {
    const S = stage;
    const cutMat = S.material(C.modelCut);
    const whiteMat = S.material(C.model);
    const mats = [cutMat, whiteMat, whiteMat, whiteMat, whiteMat, whiteMat];   // +x face = section cut

    // a strip is wrapped in its own group so it can extrude from the left cut (x = X0)
    const strips = [];   // { g, ring }
    const addStrip = (z, top, ring, part) => {
      const g = new THREE.Group();
      S.solid(stripGeo(z, top), { material: mats }, g);
      part.add(g);
      strips.push({ g, ring });
      return g;
    };

    // ================= street (sidewalks + general lanes) =================
    const street = S.part('Street');
    addStrip(Z.swN, H_SW, 3, street); addStrip(Z.swF, H_SW, 3, street);
    const genN = addStrip(Z.genN, 0, 2, street), genF = addStrip(Z.genF, 0, 2, street);
    // dashed divider between the two general lanes of each direction
    const marks = [];
    const dashOpts = { width: LW.hair, color: C.hair, dashed: true, dashSize: 3, gapSize: 4.5 };
    marks.push(S.lines([X0 + 0.3, 0.012, 9.4, X1 - 0.3, 0.012, 9.4], dashOpts, genN));
    marks.push(S.lines([X0 + 0.3, 0.012, -9.4, X1 - 0.3, 0.012, -9.4], dashOpts, genF));

    // ================= bus lanes (the middle of the road) =================
    const lanes = S.part('Bus lanes');
    const laneStrip = addStrip(Z.bus, 0, 0, lanes);
    marks.push(S.lines([X0 + 0.1, 0.012, -0.13, X1 - 0.1, 0.012, -0.13, X0 + 0.1, 0.012, 0.13, X1 - 0.1, 0.012, 0.13],
      { width: LW.hair, color: C.crease }, laneStrip));

    // ================= island bus stops =================
    const isl = S.part('Island bus stops');
    addStrip(Z.islN, H_ISL, 1, isl); addStrip(Z.islF, H_ISL, 1, isl);
    // shelters: thin canopy on slender posts along the outer (traffic) side of each island
    const shelters = [];
    const shelterAt = (xa, xb, side) => {
      const g = new THREE.Group();
      const zi = side > 0 ? Z.islN : Z.islF;
      const zo = side > 0 ? zi[1] - 0.45 : zi[0] + 0.45;          // post line, outer side
      const zr0 = side > 0 ? zi[0] + 0.35 : zo - 0.25, zr1 = side > 0 ? zo + 0.25 : zi[1] - 0.35;
      const roofH = 2.6;
      S.solid(boxGeo(xb - xa, 0.12, zr1 - zr0).translate((xa + xb) / 2, roofH, (zr0 + zr1) / 2), {}, g);
      const n = Math.max(1, Math.round((xb - xa) / 4.5));
      // posts as single ink strokes (two silhouettes of a 0.12 m box merge into a heavy black stick)
      const post = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(xa + 0.45, xb - 0.45, i / n);
        post.push(x, H_ISL, zo, x, roofH, zo);
      }
      S.lines(post, { width: 1.2, color: C.edge }, g);
      // glass screen on the traffic side: a hairline frame between the posts, so the shelter reads as a shelter
      S.lines([xa + 0.45, H_ISL + 0.25, zo, xb - 0.45, H_ISL + 0.25, zo, xa + 0.45, roofH - 0.35, zo, xb - 0.45, roofH - 0.35, zo],
        { width: LW.hair, color: C.crease }, g);
      g.userData.inks = [];
      g.traverse(o => { if (o.isInkLines) g.userData.inks.push(o); });
      isl.add(g);
      shelters.push(g);
    };
    shelterAt(-0.2, 5.6, 1);          // near stop, just ahead of the arriving blue bus
    shelterAt(3.2, 16.4, -1);         // far stop, behind the waiting green bus
    // guard rail along the traffic side of each island (posts + top rail, hairlines)
    const rails = [];
    for (const ze of [Z.islN[1] - 0.12, Z.islF[0] + 0.12]) {
      const seg = [];
      const x0 = X0 + 0.8, x1 = X1 - 0.8;
      seg.push(x0, 1.1, ze, x1, 1.1, ze);
      for (let i = 0; i <= 10; i++) { const x = lerp(x0, x1, i / 10); seg.push(x, H_ISL, ze, x, 1.1, ze); }
      const g = new THREE.Group();
      g.userData.l = S.lines(seg, { width: LW.hair, color: C.crease }, g);
      isl.add(g);
      rails.push(g);
    }

    // ================= cars (white models in the curb lanes) =================
    const cars = S.part('Cars');
    const cg = carGeo();
    const carList = [];
    const carAt = (x, z, dir) => {
      const g = new THREE.Group();
      S.solid(cg, { creaseAngle: 30 }, g);
      g.position.set(x, 0, z);
      if (dir < 0) g.rotation.y = Math.PI;
      cars.add(g);
      carList.push(g);
    };
    carAt(-12.6, 11, 1); carAt(1.2, 11, 1); carAt(12.8, 11, 1);
    carAt(-13.4, -11, -1); carAt(-3.6, -11, -1);
    // reveal order: left to right on screen
    const carOrder = carList.slice().sort((a, b) => S.project(a.position).x - S.project(b.position).x);

    // ================= buses (drive in through the cut ends) =================
    const clipL = new THREE.Plane(new THREE.Vector3(1, 0, 0), -X0);    // keeps x >= X0
    const clipR = new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1);    // keeps x <= X1
    const busPart = (name, color, deep, band, z, clip, rot) => {
      const p = S.part(name);
      const g = new THREE.Group();
      const eClip = { color: deep, color2: deep, clippingPlanes: [clip] };
      const bodyMat = S.material(color, { unique: true, clippingPlanes: [clip] });
      bodyMat.clipShadows = true;
      S.solid(busGeo(), { material: bodyMat, edges: eClip }, g);
      // low roof pod (fuel tanks), keeps the bus from reading as a plain box
      S.solid(boxGeo(5.2, 0.26, 1.7).translate(-0.6, 3.2, 0), { material: bodyMat, edges: eClip }, g);
      const wMat = S.material(C.model, { unique: true, clippingPlanes: [clip] });
      wMat.clipShadows = true;
      for (const wx of WHEELS) {
        const wg = new THREE.CylinderGeometry(0.5, 0.5, 2.6, 24).rotateX(Math.PI / 2).translate(wx, 0.5, 0);
        S.solid(wg, { material: wMat, edges: { clippingPlanes: [clip] }, creaseAngle: 40 }, g);
      }
      // window band + mullions on both sides, doors on the right side (local +z), windscreen and rear window
      const seg = [];
      const yb = 1.45, yt = 2.62, xs0 = -5.5, xs1 = 5.0;
      for (const zs of [1.253, -1.253]) {
        seg.push(xs0, yb, zs, xs1, yb, zs, xs0, yt, zs, xs1, yt, zs);
        for (let i = 0; i <= 7; i++) { const x = lerp(xs0, xs1, i / 7); seg.push(x, yb, zs, x, yt, zs); }
      }
      for (const [d0, d1] of [[4.55, 5.55], [-0.75, 0.55]]) {
        seg.push(d0, 0.5, 1.253, d0, yt, 1.253, d1, 0.5, 1.253, d1, yt, 1.253, d0, 0.5, 1.253, d1, 0.5, 1.253);
      }
      const xf = 6.003, xr = -6.003;
      seg.push(xf, 1.25, -1.0, xf, 1.25, 1.0, xf, 2.72, -1.0, xf, 2.72, 1.0, xf, 1.25, -1.0, xf, 2.72, -1.0, xf, 1.25, 1.0, xf, 2.72, 1.0);
      seg.push(xr, 1.85, -0.9, xr, 1.85, 0.9, xr, 2.6, -0.9, xr, 2.6, 0.9, xr, 1.85, -0.9, xr, 2.6, -0.9, xr, 1.85, 0.9, xr, 2.6, 0.9);
      S.lines(seg, { width: LW.hair, color: band, clippingPlanes: [clip] }, g);
      if (rot) g.rotation.y = Math.PI;
      g.position.z = z;
      p.add(g);
      return { part: p, body: g };
    };
    const blue = busPart('Blue bus', C.blue, C.blueDeep, BLUE_LINE, BUS_Z, clipL, false);
    const green = busPart('Green bus', GREEN, GREEN_DEEP, GREEN_LINE, -BUS_Z, clipR, true);
    // section caps where the green bus crosses the right cut plane (its open end faces the viewer)
    const capBody = S.solid(new THREE.PlaneGeometry(2.5, 3.2 - 0.42).rotateY(Math.PI / 2).translate(X1, (3.2 + 0.42) / 2, -BUS_Z),
      { material: S.material(GREEN, { side: THREE.DoubleSide }), edges: { color: GREEN_DEEP, color2: GREEN_DEEP }, castShadow: false }, green.part);
    const podCap = S.solid(new THREE.PlaneGeometry(1.7, 0.26).rotateY(Math.PI / 2).translate(X1, 3.33, -BUS_Z),
      { material: S.material(GREEN, { side: THREE.DoubleSide }), edges: { color: GREEN_DEEP, color2: GREEN_DEEP }, castShadow: false }, green.part);
    const wheelCaps = WHEELS.map(() => {
      const g = new THREE.Group();
      S.solid(new THREE.PlaneGeometry(2.6, 1).rotateY(Math.PI / 2), { material: S.material(C.model, { side: THREE.DoubleSide }), castShadow: false }, g);
      g.position.set(X1 + 0.004, 0.5, -BUS_Z);
      green.part.add(g);
      return g;
    });

    // ================= labels =================
    // L-shaped leaders: from a dot on the section cut, straight down through the strip's own cut face, then across
    // to one label column on the right. The key sits at the top of the same column.
    const COL = 566;
    const aIsl = new THREE.Vector3(X1, (H_ISL - T) / 2, (Z.islF[0] + Z.islF[1]) / 2);
    const aLane = new THREE.Vector3(X1, -T / 2, 0);
    const pIsl = S.project(aIsl), pLane = S.project(aLane);
    const Y_ISL = 182, Y_LANE = 226;    // first-line centres of the two labels
    const labIsl = S.label({
      text: 'Island bus stops',
      anchor: aIsl, anchorObj: isl,
      place: { mode: 'column', x: COL, dy: Y_ISL - pIsl.y, elbow: 0 },
    });
    const labLanes = S.label({
      text: 'Bus lanes in the middle of the road',
      anchor: aLane, anchorObj: lanes,
      place: { mode: 'column', x: COL, dy: Y_LANE - pLane.y, elbow: 0 },
      maxWidth: 210, nowrap: false,
    });

    // ---- route colour key: one label holding four chips (swatch + name) ----
    const key = S.label({
      text: 'Blue: main routes · Green: local · Red: express · Yellow: downtown loop',
      place: { mode: 'fixed', x: COL, y: 24, ax: 'left', ay: 'top' }, leader: false,
    });
    const chips = [];
    {
      const n = key.nameEl;
      n.textContent = '';
      n.style.cssText = `display:flex;flex-direction:column;row-gap:9px;` +
        `font-family:${FONT.family};font-size:16px;font-weight:500;line-height:1.2;color:${C.ink};letter-spacing:0;`;
      for (const [col, txt] of [[C.blue, 'Blue: main routes'], [GREEN, 'Green: local'], [C.red, 'Red: express'], [YELLOW, 'Yellow: downtown loop']]) {
        const chip = document.createElement('div');
        chip.style.cssText = 'display:flex;align-items:center;gap:10px;white-space:nowrap;will-change:transform,opacity;';
        const sw = document.createElement('span');
        sw.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:2px;background:${col};flex:none;`;
        const t = document.createElement('span');
        t.textContent = txt;
        chip.append(sw, t);
        n.appendChild(chip);
        chips.push(chip);
      }
      key.measure();
    }

    // ================= animator props =================
    // One master progress for the whole build; every sub-motion carries its own easing, so the backward run
    // (the same function played in reverse) turns each ease-out arrival into an ease-in departure.
    // 1. the whole street profile rises at the left cut, then extrudes to the right, the middle strip fastest
    //    (an internal construction move: ease-in-out, so nothing zips in)
    const grow0 = 0.15, EXT0 = 0.04;
    S.anim.prop('build', 0, v => {
      const grow = sub(v, 0, grow0, ease.out);
      for (const { g, ring } of strips) {
        const k = sub(v, EXT0, EXT0 + 0.34 + ring * 0.03, ease.inOutSine);
        g.scale.set(Math.max(1e-4, k), Math.max(1e-4, grow), 1);
        g.position.x = X0 * (1 - k);
        g.visible = grow > 1e-3;
        const sl = g.children[0].userData.lines;
        if (sl) sl.material.setOpacity(grow);
      }
      const m = sub(v, 0.4, 0.54);
      for (const l of marks) { l.material.setOpacity(m); l.visible = m > 0.01; }
      // 2. shelters, then the guard rails, rise from the finished islands
      shelters.forEach((g, i) => {
        const k = sub(v, 0.34 + i * 0.04, 0.52 + i * 0.04, ease.out);
        g.scale.y = Math.max(1e-4, k); g.position.y = H_ISL * (1 - k);
        g.userData.inks.forEach(l => l.material.setOpacity(Math.min(1, k / 0.3)));
        g.visible = k > 1e-3;
      });
      rails.forEach((g, i) => {
        const k = sub(v, 0.4 + i * 0.03, 0.56 + i * 0.03, ease.out);
        g.scale.y = Math.max(1e-4, k); g.position.y = H_ISL * (1 - k);
        g.userData.l.material.setOpacity(Math.min(1, k * 3));
        g.visible = k > 1e-3;
      });
      // 3. cars rise in place, left to right
      carOrder.forEach((g, i) => {
        const k = sub(v, 0.26 + i * 0.035, 0.44 + i * 0.035, ease.out);
        g.scale.y = Math.max(1e-4, k);
        const sl = g.children[0].userData.lines;
        if (sl) sl.material.setOpacity(Math.min(1, k / 0.35));
        g.visible = k > 1e-3;
      });
      // 4. buses glide in through the cut ends and brake to rest
      const kb = sub(v, 0.46, 0.90, outQuad);
      const kg = sub(v, 0.50, 0.94, outQuad);
      blue.body.position.x = lerp(X0 - BUS_HALF - 0.6, BLUE_REST, kb);
      const gx = lerp(X1 + BUS_HALF + 0.6, GREEN_REST, kg);
      green.body.position.x = gx;
      blue.part.visible = kb > 1e-4;
      green.part.visible = kg > 1e-4;
      // green bus section caps at the right cut (the body, and each wheel's chord)
      capBody.visible = kg > 1e-4 && gx - BUS_HALF < X1 && gx + BUS_HALF > X1;
      podCap.visible = kg > 1e-4 && gx - 2.0 < X1 && gx + 3.2 > X1;     // turned 180: pod spans gx-2.0 to gx+3.2
      WHEELS.forEach((wx, i) => {
        const d = X1 - (gx - wx);              // bus is turned 180 degrees: local +x points to world -x
        const on = kg > 1e-4 && Math.abs(d) < 0.499;
        wheelCaps[i].visible = on;
        if (on) wheelCaps[i].scale.y = 2 * Math.sqrt(0.25 - d * d);
      });
    }, { kind: 'reveal', dur: 2000 });

    labelProp(S, 'labIsl', labIsl);
    labelProp(S, 'labLanes', labLanes);
    S.anim.prop('key', 0, v => {
      key.setOpacity(v > 0 ? 1 : 0);
      chips.forEach((c, i) => {
        const k = sub(v, i * 0.14, 0.58 + i * 0.14, ease.out);
        c.style.opacity = String(k);
        c.style.transform = `translateX(${(-(1 - k) * 8).toFixed(2)}px)`;
      });
    }, { kind: 'fade', dur: 640 });

    return {
      targets: n => {
        const on = n >= 1 ? 1 : 0;
        return { build: on, labIsl: on, labLanes: on, key: on };
      },
      plan: (name, from, to, dir) => {
        if (dir < 0) {
          if (name === 'build') return { delay: 140, dur: 1150, ease: ease.linear };
          return { delay: 0, dur: 300, ease: ease.in };
        }
        const fwd = {
          build: { delay: 0, dur: 2000, ease: ease.linear },
          labIsl: { delay: 1800 },
          labLanes: { delay: 1875 },
          key: { delay: 1950, ease: ease.linear },
        };
        return fwd[name] || null;
      },
    };
  },
});
