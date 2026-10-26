// s18-buslane — Seoul's median bus lanes (2004 bus reform), section axonometric of one arterial block.
// The street is cut at both ends like a study-model section: sidewalks, two general lanes each way,
// island bus stops (raised islands with shelters) and the two bus lanes in the middle of the road.
// Korea drives on the right and bus doors are on the right, so each island sits on the outer side of
// its bus lane. A blue trunk bus and a green local bus drive in along the median lanes; cars are small
// white models in the curb lanes. The four-colour route key is the one place red/yellow/green swatches appear.
// States: 0 empty · 1 street, islands, buses, labels and key.
import {
  defineDiagram, THREE, C, LW, FONT, ease, sub, lerp, labelProp,
  boxGeo, loftGeo, rectPts,
} from '../kit3d/index.js';

// ---- dimensions (m): street along x, cross-section across z (+z = near side) ----
const X0 = -21, X1 = 21;           // block cut at both ends
const T = 1.2;                      // slab depth shown in the section cut
const Z = {
  swN: [12.6, 15.6], genN: [6.2, 12.6], islN: [3.3, 6.2], busN: [0, 3.3],
  busF: [-3.3, 0], islF: [-6.2, -3.3], genF: [-12.6, -6.2], swF: [-15.6, -12.6],
};
const H_SW = 0.15, H_ISL = 0.35;
const GREEN = '#3E9B35', GREEN_DEEP = '#1F5A1A';
const YELLOW = '#EDB21C';

// strip of the section block: x range, z range, top height (bottom at -T)
function strip(z, top, x0 = X0, x1 = X1) {
  const g = boxGeo(x1 - x0, top + T, z[1] - z[0]);
  g.translate((x0 + x1) / 2, -T, (z[0] + z[1]) / 2);
  return g;
}

// bus body: side profile (x, y) extruded across z, small roof chamfer
function busGeo(len = 12, h = 3.2, w = 2.5, lift = 0.45) {
  const s = new THREE.Shape();
  const a = len / 2, c = 0.28;
  s.moveTo(-a, lift); s.lineTo(a, lift); s.lineTo(a, h - c); s.lineTo(a - c, h); s.lineTo(-a + c, h); s.lineTo(-a, h - c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  return g;
}

function carGeos() {
  const body = boxGeo(4.4, 0.72, 1.8).translate(0, 0.26, 0);
  const cab = loftGeo(rectPts(2.5, 1.66, -0.15, 0), rectPts(1.7, 1.4, -0.25, 0), 0.98, 1.5);
  return [body, cab];
}

export default defineDiagram({
  id: 's18-buslane',
  states: 1,
  region: { x: 100, y: 330, w: 800, h: 300 },
  stage: {
    view: { azimuth: 27, elevation: 27, target: [0, 0, 0], scale: 9.6, at: [276, 140] },
    shadowBox: { min: [-22, -1.2, -16], max: [22, 3.6, 16] },
    ground: false,
  },
  build(stage) {
    const S = stage;
    const all = [];   // rising pieces: { obj, delay } for the street build

    // ================= street block (sidewalks + general lanes) =================
    const street = S.part('Street');
    const sw = [Z.swN, Z.swF].map(z => S.solid(strip(z, H_SW), {}, street));
    const gen = [Z.genN, Z.genF].map(z => S.solid(strip(z, 0), {}, street));
    // lane lines on the general lanes: dashed divider, solid curb edge stays a geometry crease
    const laneMarks = [];
    for (const zc of [9.4, -9.4]) laneMarks.push(X0 + 0.4, 0.01, zc, X1 - 0.4, 0.01, zc);
    const dash = S.lines(laneMarks, { width: LW.hair, color: C.hair, dashed: true, dashSize: 3, gapSize: 4.5 }, street);

    // ================= bus lanes (the focal strip) =================
    const lanes = S.part('Bus lanes');
    const busStrip = S.solid(strip([Z.busF[0], Z.busN[1]], 0), {}, lanes);
    // double centre line between the two directions
    const cl = [];
    for (const zc of [-0.14, 0.14]) cl.push(X0 + 0.2, 0.012, zc, X1 - 0.2, 0.012, zc);
    const centre = S.lines(cl, { width: LW.hair, color: C.crease }, lanes);

    // ================= island bus stops =================
    const isl = S.part('Island bus stops');
    const islands = [Z.islN, Z.islF].map(z => S.solid(strip(z, H_ISL), {}, isl));
    // shelters: thin roof on slender posts, along the outer half of each island
    const shelters = [];
    const shelterAt = (xa, xb, zc, side) => {
      const g = new THREE.Group();
      const roofW = 1.9, roofH = 2.7;
      const roof = S.solid(boxGeo(xb - xa, 0.14, roofW).translate((xa + xb) / 2, roofH, zc), {}, g);
      const n = Math.round((xb - xa) / 4.2);
      for (let i = 0; i <= n; i++) {
        const x = lerp(xa + 0.5, xb - 0.5, i / n);
        S.solid(boxGeo(0.12, roofH - H_ISL, 0.12).translate(x, H_ISL, zc + side * 0.6), {}, g);
      }
      isl.add(g);
      shelters.push(g);
      return roof;
    };
    shelterAt(-8.5, 2, (Z.islN[0] + Z.islN[1]) / 2, 1);
    shelterAt(4, 19, (Z.islF[0] + Z.islF[1]) / 2, -1);
    // guard fence along the traffic side of each island (posts + top rail, hairlines)
    const fence = [];
    for (const [ze, x0, x1] of [[Z.islN[1] - 0.15, X0 + 1, X1 - 1], [Z.islF[0] + 0.15, X0 + 1, X1 - 1]]) {
      fence.push(x0, 1.15, ze, x1, 1.15, ze);
      for (let x = x0; x <= x1 + 1e-6; x += 2) fence.push(x, H_ISL, ze, x, 1.15, ze);
    }
    const rail = S.lines(fence, { width: LW.hair, color: C.crease }, isl);

    // ================= cars (white models in the curb lanes) =================
    const cars = S.part('Cars');
    const [cb, cc] = carGeos();
    const carList = [];
    const carAt = (x, z, dir) => {
      const g = new THREE.Group();
      S.solid(cb, {}, g);
      S.solid(cc, {}, g);
      g.position.set(x, 0, z);
      if (dir < 0) g.rotation.y = Math.PI;
      cars.add(g);
      carList.push(g);
    };
    carAt(-15.5, 11, 1);
    carAt(-1.5, 11, 1);
    carAt(13, 11, 1);
    carAt(-12, -11, -1);
    carAt(2.5, -11, -1);
    carAt(16, -11, -1);

    // ================= buses (drive in through the cut ends) =================
    const clipL = new THREE.Plane(new THREE.Vector3(1, 0, 0), -X0);    // keeps x >= X0
    const clipR = new THREE.Plane(new THREE.Vector3(-1, 0, 0), X1);    // keeps x <= X1
    const busPart = (name, color, deep, band, z, clip) => {
      const p = S.part(name);
      const g = new THREE.Group();
      const mOpts = { unique: true, clippingPlanes: [clip] };
      S.solid(busGeo(), { color, matOpts: mOpts, edges: { color: deep, color2: deep, clippingPlanes: [clip] } }, g);
      const wMat = S.material(C.model, { unique: true, clippingPlanes: [clip] });
      for (const wx of [3.3, -3.0]) {
        const wg = new THREE.CylinderGeometry(0.5, 0.5, 2.62, 20).rotateX(Math.PI / 2).translate(wx, 0.5, 0);
        S.solid(wg, { material: wMat, edges: { clippingPlanes: [clip] }, creaseAngle: 40 }, g);
      }
      // window band + door lines on both long sides (light lines on the coloured body)
      const seg = [];
      for (const zs of [1.252, -1.252]) {
        const yb = 1.5, yt = 2.62;
        seg.push(-5.3, yb, zs, 5.55, yb, zs, -5.3, yt, zs, 5.55, yt, zs);
        for (let x = -5.3; x <= 5.56; x += 1.55) seg.push(x, yb, zs, x, yt, zs);
      }
      // windscreen on both ends
      for (const xs of [6.002, -6.002]) seg.push(xs, 1.4, -1.0, xs, 1.4, 1.0, xs, 2.75, -1.0, xs, 2.75, 1.0, xs, 1.4, -1.0, xs, 2.75, -1.0, xs, 1.4, 1.0, xs, 2.75, 1.0);
      S.lines(seg, { width: LW.hair, color: band, clippingPlanes: [clip] }, g);
      g.position.z = z;
      p.add(g);
      return { part: p, body: g };
    };
    const blue = busPart('Blue bus', C.blue, C.blueDeep, '#9DB6DA', (Z.busN[0] + Z.busN[1]) / 2, clipL);
    const green = busPart('Green bus', GREEN, GREEN_DEEP, '#B9DDB3', (Z.busF[0] + Z.busF[1]) / 2, clipR);
    green.body.rotation.y = Math.PI;
    const BLUE_X = -14.2, GREEN_X = 12.6;   // resting positions (blue approaching its island, green at its stop)

    // ================= labels =================
    const pA = S.project(new THREE.Vector3(X1, 0, 1.2));
    const pB = S.project(new THREE.Vector3(X1, H_ISL, -4.9));
    const labLanes = S.label({
      text: 'Bus lanes in the middle of the road',
      anchor: new THREE.Vector3(X1, 0, 1.2), anchorObj: lanes,
      place: { mode: 'fixed', x: pA.x + 46, y: pA.y + 62, ax: 'left', ay: 'first', shoulder: 0 },
      leader: 'straight', maxWidth: 270, nowrap: false,
    });
    const labIsl = S.label({
      text: 'Island bus stops',
      anchor: new THREE.Vector3(X1, H_ISL, -4.9), anchorObj: isl,
      place: { mode: 'fixed', x: pB.x + 46, y: pB.y + 34, ax: 'left', ay: 'first' },
      leader: 'straight',
    });

    // ---- route colour key: one label holding four chips (swatch + name) ----
    const key = S.label({
      text: 'Blue: main routes · Green: local · Red: express · Yellow: downtown loop',
      place: { mode: 'fixed', x: 776, y: 24, ax: 'right', ay: 'top' }, leader: false,
    });
    {
      const n = key.nameEl;
      n.textContent = '';
      n.style.cssText = `display:grid;grid-template-columns:auto auto;column-gap:26px;row-gap:9px;` +
        `font-family:${FONT.family};font-size:16px;font-weight:500;line-height:1.2;color:${C.ink};letter-spacing:0;`;
      for (const [col, txt] of [[C.blue, 'Blue: main routes'], [GREEN, 'Green: local'], [C.red, 'Red: express'], [YELLOW, 'Yellow: downtown loop']]) {
        const chip = document.createElement('span');
        chip.style.cssText = 'display:flex;align-items:center;gap:9px;white-space:nowrap;';
        const sw = document.createElement('span');
        sw.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:2px;background:${col};flex:none;`;
        const t = document.createElement('span');
        t.textContent = txt;
        chip.append(sw, t);
        n.appendChild(chip);
      }
      key.measure();
    }

    // ================= animator props =================
    // street build: strips rise out of the section (scale.y), staggered from the edges to the middle
    const order = [sw[0], sw[1], gen[0], gen[1], ...islands, busStrip];
    const baseY = -T;
    order.forEach(o => { o.userData.y0 = baseY; });
    S.anim.prop('street', 0, v => {
      order.forEach((o, i) => {
        const k = sub(v, i * 0.06, 0.6 + i * 0.06, ease.out);
        o.scale.y = Math.max(1e-3, k);
        o.position.y = baseY * (1 - k);
        o.visible = k > 0.002;
      });
      const m = sub(v, 0.55, 1, ease.out);
      dash.visible = centre.visible = m > 0.02;
      dash.material.setOpacity(m);
      centre.material.setOpacity(m);
    }, { kind: 'reveal', dur: 1000 });
    // islands' shelters and the cars rise in place
    S.anim.prop('fixtures', 0, v => {
      const kr = sub(v, 0, 0.6);
      rail.material.setOpacity(kr); rail.visible = kr > 0.02;
      shelters.forEach((g, i) => {
        const k = sub(v, i * 0.12, 0.7 + i * 0.12, ease.out);
        g.scale.y = Math.max(1e-3, k); g.visible = k > 0.002;
      });
      carList.forEach((g, i) => {
        const k = sub(v, 0.1 + i * 0.07, 0.6 + i * 0.07, ease.out);
        g.scale.y = Math.max(1e-3, k); g.visible = k > 0.002;
      });
    }, { kind: 'reveal', dur: 900, delay: 450 });
    // buses drive in through the cut ends along their lanes
    S.anim.prop('buses', 0, v => {
      const kb = sub(v, 0, 0.9);
      const kg = sub(v, 0.1, 1);
      blue.body.position.x = lerp(X0 - 7, BLUE_X, kb);
      green.body.position.x = lerp(X1 + 7, GREEN_X, kg);
      blue.part.visible = kb > 0.001;
      green.part.visible = kg > 0.001;
    }, { kind: 'reveal', dur: 1200, delay: 650 });
    labelProp(S, 'labLanes', labLanes, { delay: 1500 });
    labelProp(S, 'labIsl', labIsl, { delay: 1580 });
    labelProp(S, 'key', key, { delay: 1700 });

    return {
      targets: n => {
        const on = n >= 1 ? 1 : 0;
        return { street: on, fixtures: on, buses: on, labLanes: on, labIsl: on, key: on };
      },
      plan: (name, from, to, dir) => {
        if (dir < 0) {
          const back = { labLanes: 0, labIsl: 0, key: 0, buses: 80, fixtures: 160, street: 260 };
          return { delay: back[name] ?? 0, dur: name.startsWith('lab') || name === 'key' ? 320 : 600, ease: ease.in };
        }
        if (name === 'buses') return { ease: ease.out };
        return null;
      },
    };
  },
});
