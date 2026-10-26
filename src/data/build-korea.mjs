#!/usr/bin/env node
// Reproducible map pipeline for the deck's Korea maps (s01-map, s03-map, s15-export).
//
// Sources (free to use; downloaded to .tmp/3d/geo/, never committed):
//   KOSTAT 2018 provinces  https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-provinces-2018-geo.json
//   KOSTAT 2013 Seoul gu   https://cdn.jsdelivr.net/gh/southkorea/seoul-maps@master/kostat/2013/json/seoul_municipalities_geo_simple.json
// Tools (installed in .tmp/3d/tools, not in the workspace): topojson-server, topojson-simplify, topojson-client.
//
// Steps: project (Lambert conformal conic, km) -> topology (shared arcs) -> Visvalingam presimplify -> drop islands
// below a small area -> simplify -> store arcs; src/kit3d/map.js Chaikin-smooths every ARC once at load with its end nodes fixed (shared borders are smoothed
// once, so neighbouring provinces never gap or overlap) -> compact JSON (arcs + per-feature arc rings).
//
// Usage: node src/data/build-korea.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, '.tmp/3d/tools/package.json'));
const { topology } = require('topojson-server');
const { presimplify, simplify, filter, filterWeight, planarRingArea, planarTriangleArea } = require('topojson-simplify');

export const PROJ = { type: 'lcc', lat0: 36, lon0: 127.5, lat1: 34, lat2: 38, R: 6371.0088 };

export function makeProjection(P = PROJ) {
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
    return [p * Math.sin(th), rho0 - p * Math.cos(th)];   // x east, y north (km)
  };
}

const project = makeProjection();

function projectFC(fc) {
  const mapRing = ring => ring.map(([lon, lat]) => project(lon, lat));
  return {
    type: 'FeatureCollection',
    features: fc.features.map(f => {
      const g = f.geometry;
      const coords = g.type === 'Polygon' ? g.coordinates.map(mapRing) : g.coordinates.map(p => p.map(mapRing));
      return { type: 'Feature', properties: f.properties, geometry: { type: g.type, coordinates: coords } };
    }),
  };
}

function absoluteArcs(topo) {
  const tr = topo.transform;
  return topo.arcs.map(arc => {
    if (!tr) return arc.map(p => [p[0], p[1]]);
    let x = 0, y = 0;
    return arc.map(p => { x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; });
  });
}

// Chaikin corner cutting; open arcs keep both endpoints (topology nodes); closed arcs smooth cyclically.
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

function process(fc, { simplifyArea, islandArea, keep = () => false, smooth = 2, quant = 1e5 }) {
  let topo = topology({ f: projectFC(fc) }, quant);
  topo = presimplify(topo, planarTriangleArea);
  // drop small rings (islands), but keep exemptions
  const weigh = filterWeight(topo, islandArea, planarRingArea);
  topo = filter(topo, (ring, interior) => keep(ring, topo) || weigh(ring, interior));
  topo = simplify(topo, simplifyArea);
  const arcs = absoluteArcs(topo).map(a => chaikin(a.filter((p, i, A) => i === 0 || p[0] !== A[i - 1][0] || p[1] !== A[i - 1][1]), smooth));
  // compact: flat arrays, 2 decimals (10 m)
  const flat = arcs.map(a => a.flatMap(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
  const feats = topo.objects.f.geometries.map(g => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    return { props: g.properties || {}, polygons: polys };
  });
  return { arcs: flat, feats };
}

function main() {
  const geo = path.join(root, '.tmp/3d/geo');
  const prov = JSON.parse(fs.readFileSync(path.join(geo, 'provinces-2018.json'), 'utf8'));
  const gu = JSON.parse(fs.readFileSync(path.join(geo, 'seoul-gu.json'), 'utf8'));
  // properties come through topology() only if attached: copy name fields into geometry properties
  // Dokdo (≈131.87E 37.24N) is below the island threshold; keep it (official territory, tiny at slide scale)
  const dokdo = project(131.8697, 37.2416);
  const nearDokdo = (ring, topo) => {
    const arcs = absoluteArcs(topo);
    const a = arcs[ring[0] < 0 ? ~ring[0] : ring[0]];
    return a && Math.hypot(a[0][0] - dokdo[0], a[0][1] - dokdo[1]) < 6;
  };
  const P = process(prov, { simplifyArea: 0.08, islandArea: 12, keep: nearDokdo, smooth: 0 });
  const provinces = P.feats.map((f, i) => ({
    name: prov.features[i].properties.name_eng,
    name_ko: prov.features[i].properties.name,
    code: prov.features[i].properties.code,
    polygons: f.polygons,
  }));
  const out1 = { source: 'KOSTAT 2018 provinces (southkorea-maps), LCC km, simplified arcs (smoothed at load by kit3d/map.js)', proj: PROJ, arcs: P.arcs, provinces };
  fs.writeFileSync(path.join(root, 'src/data/korea-provinces.json'), JSON.stringify(out1));

  const G = process(gu, { simplifyArea: 0.004, islandArea: 0.01, smooth: 0 });
  const gus = G.feats.map((f, i) => ({ name: gu.features[i].properties.name_eng, name_ko: gu.features[i].properties.name, code: gu.features[i].properties.code, polygons: f.polygons }));
  const out2 = { source: 'KOSTAT 2013 Seoul municipalities (seoul-maps), LCC km, simplified arcs (smoothed at load)', proj: PROJ, arcs: G.arcs, gu: gus };
  fs.writeFileSync(path.join(root, 'src/data/seoul-gu.json'), JSON.stringify(out2));

  const pts = a => a.reduce((s, x) => s + x.length / 2, 0);
  console.log('provinces:', provinces.length, 'arcs', P.arcs.length, 'points', pts(P.arcs), 'bytes', fs.statSync(path.join(root, 'src/data/korea-provinces.json')).size);
  console.log('seoul gu :', gus.length, 'arcs', G.arcs.length, 'points', pts(G.arcs), 'bytes', fs.statSync(path.join(root, 'src/data/seoul-gu.json')).size);
}

main();
