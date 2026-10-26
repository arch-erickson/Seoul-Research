// Shared Korea map builder (s01-map, s03-map, s15-export). Data: src/data/korea-provinces.json + seoul-gu.json
// (KOSTAT, projected to a Lambert conformal conic in km by src/data/build-korea.mjs; arcs are shared between
// neighbouring provinces). Here every arc is Chaikin-smoothed ONCE with its end nodes fixed, so borders stay exact
// (no gaps/overlaps) and no vertex reads as a sharp corner at slide scale.
// World mapping: x = km east, z = -km north, y up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import KOREA from '../data/korea-provinces.json';
import SEOUL_GU from '../data/seoul-gu.json';
import { C, LW } from './tokens.js';
import { InkLines, InkLineMaterial } from './lines.js';

export function makeProjection(P = KOREA.proj) {
  const r = Math.PI / 180;
  const f1 = P.lat1 * r, f2 = P.lat2 * r, f0 = P.lat0 * r;
  const t = f => Math.tan(Math.PI / 4 + f / 2);
  const n = Math.log(Math.cos(f1) / Math.cos(f2)) / Math.log(t(f2) / t(f1));
  const F = Math.cos(f1) * Math.pow(t(f1), n) / n;
  const rho = f => P.R * F / Math.pow(t(f), n);
  const rho0 = rho(f0);
  return (lon, lat) => {
    const th = n * (lon - P.lon0) * r;
    const p = rho(lat * r);
    return [p * Math.sin(th), rho0 - p * Math.cos(th)];
  };
}
export const projectLL = makeProjection();
// lon/lat -> world Vector3 on the map plane at height y
export function llToWorld(lon, lat, y = 0) { const [x, n] = projectLL(lon, lat); return new THREE.Vector3(x, y, -n); }

// great-circle distance (km)
export function haversineKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371.0088;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function chaikin(pts, iters) {
  const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9;
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = [];
    if (closed) {
      const q = p.slice(0, -1);
      for (let i = 0; i < q.length; i++) {
        const a = q[i], b = q[(i + 1) % q.length];
        out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      out.push(out[0]);
    } else {
      out.push(p[0]);
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (i > 0) out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
        if (i < p.length - 2) out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      out.push(p[p.length - 1]);
    }
    p = out;
  }
  return p;
}

function decode(data, key, smooth) {
  const arcs = data.arcs.map(flat => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    return chaikin(pts, smooth);
  });
  const ringCoords = ring => {
    const out = [];
    for (const ai of ring) {
      const a = ai < 0 ? arcs[~ai].slice().reverse() : arcs[ai];
      for (let i = out.length ? 1 : 0; i < a.length; i++) out.push(a[i]);
    }
    return out;
  };
  const feats = data[key].map(f => ({ ...f, rings: f.polygons.map(poly => poly.map(ringCoords)) }));
  // arc usage count -> interior (2) vs exterior (1)
  const use = new Array(arcs.length).fill(0);
  for (const f of data[key]) for (const poly of f.polygons) for (const ring of poly) for (const ai of ring) use[ai < 0 ? ~ai : ai]++;
  return { arcs, feats, use };
}

const _cache = new Map();
export function loadKorea(smooth = 2) {
  const k = 'k' + smooth;
  if (!_cache.has(k)) _cache.set(k, decode(KOREA, 'provinces', smooth));
  return _cache.get(k);
}
export function loadSeoulGu(smooth = 2) {
  const k = 'g' + smooth;
  if (!_cache.has(k)) _cache.set(k, decode(SEOUL_GU, 'gu', smooth));
  return _cache.get(k);
}

// polygon (rings of [x,n] km) -> THREE.Shape in shape space (x, n) ; extruded and rotated so n -> -z
function shapesOf(rings) {
  const shapes = [];
  for (const poly of rings) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    const s = new THREE.Shape(outer.map(([x, n]) => new THREE.Vector2(x, n)));
    for (let h = 1; h < poly.length; h++) s.holes.push(new THREE.Path(poly[h].map(([x, n]) => new THREE.Vector2(x, n))));
    shapes.push(s);
  }
  return shapes;
}

// Extruded plate from province rings: bottom at y0, thickness t. Shape (x, n) -> world (x, y, -n).
export function plateGeometry(rings, t, y0 = 0) {
  const shapes = shapesOf(rings);
  if (!shapes.length) return null;
  const g = new THREE.ExtrudeGeometry(shapes, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);         // shape y (north) -> -z, extrusion +z -> +y
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}

// Line segments (world) for a list of arcs at height y
export function arcSegments(arcs, idxs, y) {
  const seg = [];
  for (const i of idxs) {
    const a = arcs[i];
    for (let k = 0; k < a.length - 1; k++) seg.push(a[k][0], y, -a[k][1], a[k + 1][0], y, -a[k + 1][1]);
  }
  return seg;
}

// Fat lines whose dash distances are normalised per arc (0..1), so `drawIn(p)` reveals every arc at the same pace.
export function drawableArcs(arcs, idxs, y, opts = {}) {
  const seg = [], dist = [];
  for (const i of idxs) {
    const a = arcs[i];
    let L = 0;
    const cum = [0];
    for (let k = 0; k < a.length - 1; k++) { L += Math.hypot(a[k + 1][0] - a[k][0], a[k + 1][1] - a[k][1]); cum.push(L); }
    for (let k = 0; k < a.length - 1; k++) {
      seg.push(a[k][0], y, -a[k][1], a[k + 1][0], y, -a[k + 1][1]);
      dist.push(cum[k] / L, cum[k + 1] / L);
    }
  }
  const g = new LineSegmentsGeometry();
  g.setPositions(seg.length ? seg : [0, 0, 0, 0, 0, 0]);
  const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(dist.length ? dist : [0, 0]), 2, 1);
  g.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(buf, 1, 0));
  g.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(buf, 1, 1));
  const m = new InkLineMaterial({
    color: opts.color ?? C.outline, color2: opts.color ?? C.outline, width: opts.width ?? 0.8, width2: opts.width ?? 0.8,
    dashed: true, dashSize: 1, gapSize: 0, opacity: opts.opacity ?? 1,
  });
  const lines = new InkLines(g, m);
  lines.drawIn = p => {
    // dash [0,p] drawn, gap the rest; p >= 1 draws everything
    m.uniforms.dashSize.value = p >= 0.9999 ? 10 : Math.max(0, p);
    m.uniforms.gapSize.value = p >= 0.9999 ? 0 : 10;
    lines.visible = p > 0.0001;
  };
  return lines;
}

export { KOREA, SEOUL_GU };

// ---------------------------------------------------------------------------------------------------------------
// buildKoreaMap(stage, opts): the deck's South Korea map look. Thin light-grey outlines (shared arcs drawn once),
// near-white land plate, Seoul as a gently raised red plate. Returns handles + `reveal(p)` / `seoulRise(p)`.
// opts: { thickness (km), seoulRise (km), land, outlineWidth, seoulName }
export function buildKoreaMap(stage, opts = {}) {
  const t = opts.thickness ?? 6;
  const rise = opts.seoulRise ?? 5;
  const K0 = loadKorea(opts.smooth ?? 2);
  // optional frame (lon/lat box): drop island polygons and arcs that lie outside it, so nothing peeks in at the edge
  let K = K0;
  if (opts.bounds) {
    const [w, s0, e, n] = opts.bounds;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const lon of [w, (w + e) / 2, e]) for (const lat of [s0, (s0 + n) / 2, n]) { const [x, y] = projectLL(lon, lat); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const inside = pts => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [x, y] of pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); } const cx = (a + b) / 2, cy = (c + d) / 2; return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; };
    const keepArc = K0.arcs.map(a => inside(a));
    K = { arcs: K0.arcs, use: K0.use, keepArc, feats: K0.feats.map(f => ({ ...f, rings: f.rings.filter(poly => inside(poly[0])) })) };
  }
  const seoulIdx = K.feats.findIndex(f => f.name === (opts.seoulName || 'Seoul'));
  const landPart = stage.part('South Korea');
  const seoulPart = stage.part('Seoul');
  const geos = [];
  K.feats.forEach((f, i) => { if (i !== seoulIdx) { const g = plateGeometry(f.rings, t, 0); if (g) geos.push(g.toNonIndexed()); } });
  for (const g of geos) { g.deleteAttribute('uv'); }
  const landGeo = mergeGeometries(geos, false);
  const landMat = stage.material(opts.land ?? '#F6F6F3', { unique: true });
  const land = stage.solid(landGeo, { material: landMat, edges: false, castShadow: true, receiveShadow: true }, landPart);
  // outlines: every arc once (coast + borders), on the top face
  const all = K.arcs.map((_, i) => i).filter(i => !K.keepArc || K.keepArc[i]);
  const outline = drawableArcs(K.arcs, all, t + 0.02, { color: opts.outlineColor ?? C.outline, width: opts.outlineWidth ?? 0.8 });
  landPart.add(outline);
  // Seoul raised plate
  const sg = plateGeometry(K.feats[seoulIdx].rings, t + rise, 0);
  const seoulMat = stage.material(C.red, { unique: true, roughness: 0.8 });
  // high crease angle: only the top/bottom outline creases draw, not a seam at every bend of the wall
  const seoul = stage.solid(sg, { material: seoulMat, edges: { color: C.redDeep, color2: C.redDeep, width: 0.8, width2: 0.6, creaseAngle: 80 } }, seoulPart);
  const box = new THREE.Box3().setFromBufferAttribute(sg.attributes.position);
  const seoulTop = new THREE.Vector3((box.min.x + box.max.x) / 2, t + rise, (box.min.z + box.max.z) / 2);
  return {
    K, landPart, seoulPart, land, seoul, outline, seoulTop, seoulBox: box,
    reveal(p) {           // outlines draw in, then the plate fills
      outline.drawIn(Math.min(1, p / 0.7));
      const f = Math.max(0, Math.min(1, (p - 0.45) / 0.55));
      land.visible = f > 0.001;
      landMat.opacity = f; landMat.transparent = f < 0.999; landMat.depthWrite = f > 0.5;
      landPart.visible = p > 0.0001;
    },
    seoulRise(p) {
      seoulPart.visible = p > 0.0001;
      seoul.scale.y = Math.max(0.0001, p);
    },
  };
}
