// s15-export — where Seoul's trash goes now (from 1 Jan 2026 direct landfilling is banned in the capital region):
// Gangdong-gu ships household waste to private incinerators in Cheonan and Sejong; Gangnam-gu plans to send waste to
// Cheongju. KOSTAT provinces (smoothed, light-grey outlines) + KOSTAT Seoul gu. Distance labels are great-circle
// distances from Seoul City Hall, computed here from coordinates and rounded to 5 km (85 / 125 / 110 km).
import { defineDiagram, THREE, C, ease, sub, labelProp, setOpacity } from '../kit3d/index.js';
import { loadKorea, loadSeoulGu, plateGeometry, drawableArcs, projectLL, haversineKm } from '../kit3d/map.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { InkLines, InkLineMaterial } from '../kit3d/lines.js';

const REGION = { x: 850, y: 470, w: 950, h: 380 };
const CITY_HALL = [37.5665, 126.9780];
const CITIES = [
  { name: 'Cheonan', lat: 36.8151, lon: 127.1139, from: 'Gangdong-gu' },
  { name: 'Sejong', lat: 36.4800, lon: 127.2890, from: 'Gangdong-gu' },
  { name: 'Cheongju', lat: 36.6424, lon: 127.4890, from: 'Gangnam-gu' },
];
for (const c of CITIES) c.km = Math.round(haversineKm(CITY_HALL[0], CITY_HALL[1], c.lat, c.lon) / 5) * 5;

const T = 2.2;            // land plate thickness (km)
const CAP = ['Seoul', 'Incheon', 'Gyeonggi-do'];
const w = (lon, lat, y = 0) => { const [x, n] = projectLL(lon, lat); return new THREE.Vector3(x, y, -n); };

// only the capital region + Chungcheong are drawn, as one self-contained shape
const SHOW = ['Seoul', 'Incheon', 'Gyeonggi-do', 'Chungcheongnam-do', 'Sejongsi', 'Daejeon', 'Chungcheongbuk-do'];
// camera: oblique, from the south-west, so the routes run left -> right across the wide region; auto-fit
const AZ = -42, EL = 29;
// outlying West Sea islands (Baengnyeongdo, Yeonpyeongdo, Deokjeokdo …) are left out so the shape frames tightly
const WEST_X = projectLL(126.2, 37)[0];
const nearPoly = poly => poly[0].reduce((s, p) => s + p[0], 0) / poly[0].length > WEST_X;
function fit() {
  const K = loadKorea(0);
  const r = Math.PI / 180;
  const right = [Math.cos(AZ * r), -Math.sin(AZ * r)], upz = [-Math.sin(EL * r) * Math.sin(AZ * r), -Math.sin(EL * r) * Math.cos(AZ * r)];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of K.feats) if (SHOW.includes(f.name)) for (const poly of f.rings.filter(nearPoly)) for (const [x, n] of poly[0]) {
    const z = -n;
    const sx = x * right[0] + z * right[1], sy = x * upz[0] + z * upz[1];
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const L = 24, R = REGION.w - 24, TOP = 20, BOT = REGION.h - 14;
  const scale = Math.min((R - L) / (x1 - x0), (BOT - TOP) / (y1 - y0));
  // world point that maps to the centre of the fitted box: solve on the ground plane
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // invert the 2x2 basis [right; upz] for (x, z)
  const det = right[0] * upz[1] - right[1] * upz[0];
  const wx = (cx * upz[1] - right[1] * cy) / det, wz = (right[0] * cy - cx * upz[0]) / det;
  return { scale, target: [wx, 0, wz], at: [(L + R) / 2, (TOP + BOT) / 2] };
}
const FIT = fit();
const mid = new THREE.Vector3(FIT.target[0], 0, FIT.target[2]);
const VIEW = { azimuth: AZ, elevation: EL, target: FIT.target, scale: FIT.scale, at: FIT.at };

export default defineDiagram({
  id: 's15-export',
  states: 1,
  region: REGION,
  stage: {
    view: VIEW,
    shadowBox: { min: [mid.x - 160, -2, mid.z - 160], max: [mid.x + 160, 20, mid.z + 160] },
    ground: { y: 0, opacity: 0.07 },
  },
  build(stage) {
    const K = loadKorea(2);
    const land = stage.part('Map');
    const geos = [];
    const shown = new Set(K.feats.map((f, i) => (SHOW.includes(f.name) ? i : -1)).filter(i => i >= 0));
    for (const i of shown) { const f = K.feats[i]; if (f.name === 'Seoul') continue; const g = plateGeometry(f.rings.filter(nearPoly), T, 0); if (g) { g.deleteAttribute('uv'); geos.push(g.toNonIndexed()); } }
    const shownArcs = new Set();
    for (const i of shown) K.feats[i].polygons.forEach((poly, pi) => { if (!nearPoly(K.feats[i].rings[pi])) return; for (const ring of poly) for (const ai of ring) shownArcs.add(ai < 0 ? ~ai : ai); });
    stage.solid(mergeGeometries(geos, false), { material: stage.material('#F6F6F3'), edges: false }, land);
    const outlines = drawableArcs(K.arcs, [...shownArcs], T + 0.03, { color: C.outline, width: 0.8 });
    outlines.drawIn(1);
    land.add(outlines);
    // capital-region boundary: arcs used by exactly one of Seoul / Incheon / Gyeonggi
    const capIdx = new Set(K.feats.map((f, i) => (CAP.includes(f.name) ? i : -1)).filter(i => i >= 0));
    const capUse = new Array(K.arcs.length).fill(0), allUse = new Array(K.arcs.length).fill(0);
    K.feats.forEach((f, fi) => { for (const poly of f.polygons) for (const ring of poly) for (const ai of ring) { const a = ai < 0 ? ~ai : ai; allUse[a]++; if (capIdx.has(fi)) capUse[a]++; } });
    const capArcs = K.arcs.map((_, i) => i).filter(i => capUse[i] === 1 && allUse[i] === 2);   // land borders with the rest of Korea
    const capLine = drawableArcs(K.arcs, capArcs, T + 0.06, { color: C.muted, width: 1.1 });
    capLine.material.uniforms.dashSize.value = 0;  // replaced by a real dash pattern below
    const capPart = stage.part('Capital region');
    // dashed line: rebuild with absolute distances
    const segs = [];
    for (const i of capArcs) { const a = K.arcs[i]; for (let k = 0; k < a.length - 1; k++) segs.push(a[k][0], T + 0.06, -a[k][1], a[k + 1][0], T + 0.06, -a[k + 1][1]); }
    const dashed = stage.lines(segs, { color: C.muted, width: 1.1, dashed: true, dashSize: 2.4, gapSize: 1.8 }, capPart);
    capLine.geometry.dispose(); capLine.material.dispose();

    // Seoul (subtle raise) + Gangdong-gu and Gangnam-gu picked out in red
    const seoulF = K.feats.find(f => f.name === 'Seoul');
    const seoulPart = stage.part('Seoul');
    stage.solid(plateGeometry(seoulF.rings, T + 0.9, 0), { material: stage.material('#FFFFFF'), edges: { color: C.crease, color2: C.hair, width: 0.9, width2: 0.6, creaseAngle: 80 } }, seoulPart);
    const G = loadSeoulGu(2);
    const districts = stage.part('Gangdong-gu and Gangnam-gu');
    const centers = {};
    for (const name of ['Gangdong-gu', 'Gangnam-gu']) {
      const f = G.feats.find(g => g.name === name);
      const geo = plateGeometry(f.rings, T + 1.7, 0);
      const d = stage.solid(geo, { material: stage.material(C.red, { roughness: 0.8 }), edges: { color: C.redDeep, color2: C.redDeep, width: 0.7, width2: 0.5, creaseAngle: 80 } }, districts);
      const b = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      centers[name] = new THREE.Vector3((b.min.x + b.max.x) / 2, T + 1.7, (b.min.z + b.max.z) / 2);
      d.userData.base = 1;
    }

    // cities: small ink discs
    const citiesPart = stage.part('Cities');
    const disc = new THREE.CylinderGeometry(1.6, 1.6, 0.8, 32).translate(0, 0.4, 0);
    for (const c of CITIES) {
      c.pos = w(c.lon, c.lat, T);
      const g = stage.solid(disc, { material: stage.material('#FFFFFF'), edges: { color: C.ink, color2: C.ink, width: 1.4, width2: 1.0, creaseAngle: 60 } }, citiesPart);
      g.position.copy(c.pos);
    }

    // arcs: lifted quadratic curves, drawn in one after another
    const routes = stage.part('Routes');
    const arcs = CITIES.map(c => {
      const a = centers[c.from].clone(), b = c.pos.clone().setY(T + 0.8);
      const len = a.distanceTo(b);
      const m = a.clone().lerp(b, 0.5).setY(T + len * 0.34);
      const curve = new THREE.QuadraticBezierCurve3(a, m, b);
      const pts = curve.getPoints(96);
      const seg = [], dist = [];
      let L = 0; const cum = [0];
      for (let i = 0; i < pts.length - 1; i++) { L += pts[i].distanceTo(pts[i + 1]); cum.push(L); }
      for (let i = 0; i < pts.length - 1; i++) { seg.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z); dist.push(cum[i] / L, cum[i + 1] / L); }
      const g = new LineSegmentsGeometry();
      g.setPositions(seg);
      const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(dist), 2, 1);
      g.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(buf, 1, 0));
      g.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(buf, 1, 1));
      const mat = new InkLineMaterial({ color: C.red, color2: C.red, width: 2.4, width2: 2.4, dashed: true, dashSize: 0, gapSize: 10 });
      const line = new InkLines(g, mat);
      routes.add(line);
      return { line, mat, end: pts[pts.length - 1], top: m };
    });

    // labels: city name + distance, set beside each city on open map
    const offs = { Cheonan: { dx: -18, dy: 4, ax: 'right', ay: 'top' }, Sejong: { dx: 16, dy: 6, ax: 'left', ay: 'top' }, Cheongju: { dx: 16, dy: -12, ax: 'left', ay: 'bottom' } };
    const labs = CITIES.map(c => stage.label({
      text: c.name, sub: `about ${c.km} km`, size: 20, subSize: 17, subTone: 'ink', subWeight: 500,
      anchor: c.pos, allow: [land, capPart], place: Object.assign({ mode: 'offset' }, offs[c.name]),
    }));
    const capLab = stage.label({
      text: 'Capital region', size: 16, weight: 500, tone: 'muted', caps: false,
      anchor: w(126.62, 37.92, T), allow: [land, capPart], place: { mode: 'offset', dx: -6, dy: 0, ax: 'right', ay: 'middle' },
    });

    // ---- motion: one beat; routes draw one after another, each label after its route lands ----
    stage.anim.prop('go', 0, v => {
      arcs.forEach((r, i) => {
        const p = sub(v, 0.08 + i * 0.27, 0.42 + i * 0.27, ease.inOut);
        r.mat.uniforms.dashSize.value = p >= 0.9999 ? 10 : p;
        r.mat.uniforms.gapSize.value = p >= 0.9999 ? 0 : 10;
        r.line.visible = p > 0.0005;
        const lp = sub(v, 0.36 + i * 0.27, 0.52 + i * 0.27, ease.out);
        labs[i].setOpacity(lp, (1 - lp) * -6);
      });
      districts.scale.y = Math.max(0.0001, 0.35 + 0.65 * sub(v, 0, 0.12, ease.out));
    }, { kind: 'reveal', dur: 3200 });
    // the map itself arrives with the beat (the slide shows no map before B4)
    stage.anim.prop('map', 0, v => {
      const f = sub(v, 0, 1, ease.out);
      for (const part of [land, seoulPart, citiesPart, capPart]) { part.visible = v > 0.001; }
      setOpacity(land, f); setOpacity(seoulPart, f); setOpacity(citiesPart, f); setOpacity(capPart, f);
      districts.visible = v > 0.001;
      setOpacity(districts, f);
    }, { kind: 'reveal', dur: 600 });
    labelProp(stage, 'cap', capLab, { dur: 500 });
    return {
      targets: n => ({ map: n >= 1 ? 1 : 0, go: n >= 1 ? 1 : 0, cap: n >= 1 ? 1 : 0 }),
      plan(name, from, to, dir) {
        if (dir < 0) return null;
        return { go: { delay: 450 }, cap: { delay: 500 } }[name] || null;
      },
    };
  },
});
