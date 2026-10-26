// Geometry helpers. World convention: y up; the ground is y = 0; 1 unit = 1 m unless a diagram says otherwise.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Axis-aligned box standing on y = 0 (or centred: o.center = true).
export function boxGeo(w, h, d, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!o.center) g.translate(0, h / 2, 0);
  return g;
}

// Extruded prism from a footprint polygon given as [[x, z], ...] (counter-clockwise seen from above
// or either winding), from y = y0 to y = y0 + h.
export function prismGeo(footprint, h, y0 = 0, o = {}) {
  const shape = new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (o.holes) for (const hole of o.holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: o.curveSegments ?? 24 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}

export function shapePrismGeo(shape, h, y0 = 0, o = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: o.curveSegments ?? 24 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

export function rectPts(w, d, cx = 0, cz = 0) {
  return [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
}

export function roundedRectShape(w, d, r, cx = 0, cz = 0, segs = 8) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = -(cz + d / 2), y1 = -(cz - d / 2);
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Lofted solid between two horizontal polygons with the same vertex count (bottom at y0, top at y1).
// Produces flat-shaded side quads + caps; good for tapered/flared masses.
export function loftGeo(bottom, top, y0, y1, o = {}) {
  const n = bottom.length;
  const pos = [];
  const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const B = bottom.map(([x, z]) => [x, y0, z]);
  const T = top.map(([x, z]) => [x, y1, z]);
  // orientation: ensure CCW seen from above (+y) => signed area in x,z with z flipped
  let area = 0;
  for (let i = 0; i < n; i++) { const p = bottom[i], q = bottom[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const ccw = area < 0; // in x,z with +z toward viewer, CCW from above has negative shoelace
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (ccw) quad(B[i], B[j], T[j], T[i]); else quad(B[j], B[i], T[i], T[j]);
  }
  if (o.caps !== false) {
    // fan caps (polygons assumed convex)
    for (let i = 1; i < n - 1; i++) {
      if (ccw) { pos.push(...T[0], ...T[i], ...T[i + 1]); pos.push(...B[0], ...B[i + 1], ...B[i]); }
      else { pos.push(...T[0], ...T[i + 1], ...T[i]); pos.push(...B[0], ...B[i], ...B[i + 1]); }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g = mergeVertices(g, 1e-6);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function regularPolygon(n, r, rot = 0, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

export function rotatePts(pts, ang, cx = 0, cz = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map(([x, z]) => [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]);
}

// Horizontal clipping plane that keeps everything below y = h (set h to reveal bottom-up).
export function makeWipe(normal = [0, -1, 0], constant = 0) {
  const plane = new THREE.Plane(new THREE.Vector3(...normal), constant);
  return {
    plane,
    // reveal everything with coordinate along -normal below `value`
    set(value) { plane.constant = value; },
  };
}

// Deterministic PRNG for repeatable scatter (instanced fields, strata jitter, …)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
