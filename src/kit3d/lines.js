// Fat screen-space ink lines (built on three's LineSegments2 / LineSegmentsGeometry) with
// automatic silhouette weighting: every mesh edge carries its two face normals, and the vertex
// shader decides per frame whether the edge is a silhouette (one face toward the camera, one
// away), a crease (sharp dihedral angle), or a smooth-surface edge (hidden). Silhouettes draw at
// LW.silhouette, creases at LW.crease, so curved masses (cones, tapered towers, map plates) get
// correct outlines from any view and during rotation.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { C, LW } from './tokens.js';

const VERT = /* glsl */`
#include <common>
#include <clipping_planes_pars_vertex>
uniform float uWidthA;
uniform float uWidthB;
uniform float uPxScale;
uniform float uMinPx;
uniform vec2 resolution;
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
#ifdef EDGE_MODE
  attribute vec3 instanceNA;
  attribute vec3 instanceNB;
  attribute float instanceKind;
#endif
#ifdef USE_DASH
  uniform float dashScale;
  attribute float instanceDistanceStart;
  attribute float instanceDistanceEnd;
  varying float vLineDistance;
#endif
varying vec2 vUv;
varying float vSil;

void main() {
  float aspect = resolution.x / resolution.y;
  vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
  vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );
  float sil = 1.0;
  #ifdef EDGE_MODE
    bool persp = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );
    vec3 v = persp ? normalize( - 0.5 * ( start.xyz + end.xyz ) ) : vec3( 0.0, 0.0, 1.0 );
    float da = dot( normalize( normalMatrix * instanceNA ), v );
    float db = dot( normalize( normalMatrix * instanceNB ), v );
    bool fa = da > 1e-3;
    bool fb = db > 1e-3;
    bool isSil = instanceKind > 1.5 || ( fa != fb );
    bool draw = isSil || ( instanceKind > 0.5 && ( fa || fb ) );
    if ( ! draw ) {
      gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
      vUv = vec2( 0.0 );
      vSil = 0.0;
      return;
    }
    sil = isSil ? 1.0 : 0.0;
  #endif
  vSil = sil;
  #ifdef USE_DASH
    vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
  #endif
  vUv = uv;
  vec4 clipStart = projectionMatrix * start;
  vec4 clipEnd = projectionMatrix * end;
  vec3 ndcStart = clipStart.xyz / clipStart.w;
  vec3 ndcEnd = clipEnd.xyz / clipEnd.w;
  vec2 dir = ndcEnd.xy - ndcStart.xy;
  dir.x *= aspect;
  dir = normalize( dir );
  vec2 offset = vec2( dir.y, - dir.x );
  dir.x /= aspect;
  offset.x /= aspect;
  if ( position.x < 0.0 ) offset *= - 1.0;
  if ( position.y < 0.0 ) offset += - dir;
  else if ( position.y > 1.0 ) offset += dir;
  float lw = max( mix( uWidthB, uWidthA, sil ) * uPxScale, uMinPx );
  offset *= lw;
  offset /= resolution.y;
  vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;
  offset *= clip.w;
  clip.xy += offset;
  gl_Position = clip;
  vec4 mvPosition = ( position.y < 0.5 ) ? start : end;
  #include <clipping_planes_vertex>
}
`;

const FRAG = /* glsl */`
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float opacity;
uniform float uIdMode;
uniform vec3 uIdColor;
#ifdef USE_DASH
  uniform float dashOffset;
  uniform float dashSize;
  uniform float gapSize;
  varying float vLineDistance;
#endif
varying vec2 vUv;
varying float vSil;
#include <common>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  #ifdef USE_DASH
    if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard;
    if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard;
  #endif
  if ( abs( vUv.y ) > 1.0 ) {
    float a = vUv.x;
    float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
    if ( a * a + b * b > 1.0 ) discard;
  }
  if ( uIdMode > 0.5 ) {
    gl_FragColor = vec4( uIdColor, 1.0 );
    return;
  }
  gl_FragColor = vec4( mix( uColorB, uColorA, vSil ), opacity );
  #include <colorspace_fragment>
}
`;

// Shared per-renderer uniform: physical px per design px for the current pass (canvas: pixel ratio;
// audit pass: 1). Every ink material references the same object so one assignment updates all.
export const sharedLineUniforms = {
  uPxScale: { value: 1 },
  uMinPx: { value: 0.55 },
};

export class InkLineMaterial extends THREE.ShaderMaterial {
  constructor({
    color = C.edge, color2 = C.crease, width = LW.silhouette, width2 = LW.crease,
    edgeMode = false, dashed = false, dashSize = 6, gapSize = 5, opacity = 1, depthTest = true,
    clippingPlanes = null,
  } = {}) {
    super({
      uniforms: {
        uColorA: { value: new THREE.Color(color) },
        uColorB: { value: new THREE.Color(color2) },
        uWidthA: { value: width },
        uWidthB: { value: width2 },
        uPxScale: sharedLineUniforms.uPxScale,
        uMinPx: sharedLineUniforms.uMinPx,
        resolution: { value: new THREE.Vector2(1, 1) },
        opacity: { value: opacity },
        uIdMode: { value: 0 },
        uIdColor: { value: new THREE.Color(0, 0, 0) },
        dashScale: { value: 1 },
        dashOffset: { value: 0 },
        dashSize: { value: dashSize },
        gapSize: { value: gapSize },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      clipping: true,
    });
    if (edgeMode) this.defines.EDGE_MODE = '';
    if (dashed) this.defines.USE_DASH = '';
    this.isInkLineMaterial = true;
    this.transparent = opacity < 1;
    this.depthTest = depthTest;
    if (clippingPlanes) this.clippingPlanes = clippingPlanes;
  }
  get opacityValue() { return this.uniforms.opacity.value; }
  setOpacity(v) {
    this.uniforms.opacity.value = v;
    const t = v < 0.999;
    if (t !== this.transparent) { this.transparent = t; this.needsUpdate = true; }
  }
  setColor(a, b) {
    if (a != null) this.uniforms.uColorA.value.set(a);
    if (b != null) this.uniforms.uColorB.value.set(b);
  }
}

const _vp = new THREE.Vector4();

export class InkLines extends LineSegments2 {
  constructor(geometry, material) {
    super(geometry, material);
    this.isInkLines = true;
  }
  onBeforeRender(renderer) {
    renderer.getCurrentViewport(_vp);
    const u = this.material.uniforms;
    if (u && u.resolution) u.resolution.value.set(_vp.z, _vp.w);
  }
  raycast() {}
}

// ---------- edge extraction ----------

// Returns { positions: Float32Array (6/segment), na, nb: Float32Array (3/segment), kind: Float32Array }
// kind: 0 smooth (drawn only on the silhouette), 1 crease (always drawn when facing), 2 boundary.
export function extractEdges(geometry, creaseAngle = 28) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  const triCount = index ? index.length / 3 : pos.count / 3;
  const q = 1e4;
  const vmap = new Map();
  const uniq = [];
  const vid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * q) + '_' + Math.round(y * q) + '_' + Math.round(z * q);
    let id = vmap.get(k);
    if (id === undefined) { id = uniq.length / 3; vmap.set(k, id); uniq.push(x, y, z); }
    vid[i] = id;
  }
  const edges = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
    const v = [vid[i0], vid[i1], vid[i2]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    a.fromArray(uniq, v[0] * 3); b.fromArray(uniq, v[1] * 3); c.fromArray(uniq, v[2] * 3);
    ab.subVectors(b, a); ac.subVectors(c, a);
    const n = ab.cross(ac);
    const len = n.length();
    if (len < 1e-12) continue;
    n.multiplyScalar(1 / len);
    for (let e = 0; e < 3; e++) {
      const p = v[e], r = v[(e + 1) % 3];
      const lo = Math.min(p, r), hi = Math.max(p, r);
      const key = lo * 4194304 + hi;
      let rec = edges.get(key);
      if (!rec) { rec = { lo, hi, normals: [] }; edges.set(key, rec); }
      rec.normals.push(n.x, n.y, n.z);
    }
  }
  const cosT = Math.cos(THREE.MathUtils.degToRad(creaseAngle));
  const P = [], NA = [], NB = [], K = [];
  for (const rec of edges.values()) {
    const ns = rec.normals;
    const cnt = ns.length / 3;
    let kind, na, nb;
    if (cnt === 1) { kind = 2; na = [ns[0], ns[1], ns[2]]; nb = na; }
    else if (cnt === 2) {
      na = [ns[0], ns[1], ns[2]]; nb = [ns[3], ns[4], ns[5]];
      const d = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
      kind = d < cosT ? 1 : 0;
    } else { kind = 1; na = [ns[0], ns[1], ns[2]]; nb = [ns[3], ns[4], ns[5]]; }
    P.push(uniq[rec.lo * 3], uniq[rec.lo * 3 + 1], uniq[rec.lo * 3 + 2], uniq[rec.hi * 3], uniq[rec.hi * 3 + 1], uniq[rec.hi * 3 + 2]);
    NA.push(...na); NB.push(...nb); K.push(kind);
  }
  return { positions: new Float32Array(P), na: new Float32Array(NA), nb: new Float32Array(NB), kind: new Float32Array(K) };
}

export function edgeLinesFromGeometry(geometry, opts = {}) {
  const e = extractEdges(geometry, opts.creaseAngle ?? 28);
  const g = new LineSegmentsGeometry();
  g.setPositions(e.positions.length ? e.positions : new Float32Array(6));
  const n = Math.max(1, e.positions.length / 6);
  g.setAttribute('instanceNA', new THREE.InstancedBufferAttribute(e.na.length ? e.na : new Float32Array(3), 3));
  g.setAttribute('instanceNB', new THREE.InstancedBufferAttribute(e.nb.length ? e.nb : new Float32Array(3), 3));
  g.setAttribute('instanceKind', new THREE.InstancedBufferAttribute(e.kind.length ? e.kind : new Float32Array([-1]), 1));
  if (!e.positions.length) g.instanceCount = 0;
  const m = new InkLineMaterial({
    edgeMode: true,
    color: opts.color ?? C.edge, color2: opts.color2 ?? C.crease,
    width: opts.width ?? LW.silhouette, width2: opts.width2 ?? LW.crease,
    clippingPlanes: opts.clippingPlanes ?? null,
  });
  const lines = new InkLines(g, m);
  lines.userData.segmentCount = n;
  return lines;
}

// Plain lines: segments as a flat array [x0,y0,z0,x1,y1,z1, ...]
export function inkSegments(segments, opts = {}) {
  const arr = segments instanceof Float32Array ? segments : new Float32Array(segments);
  const g = new LineSegmentsGeometry();
  g.setPositions(arr.length ? arr : new Float32Array(6));
  if (!arr.length) g.instanceCount = 0;
  const m = new InkLineMaterial({
    color: opts.color ?? C.ink, color2: opts.color ?? C.ink,
    width: opts.width ?? LW.crease, width2: opts.width ?? LW.crease,
    dashed: !!opts.dashed, dashSize: opts.dashSize ?? 6, gapSize: opts.gapSize ?? 5,
    opacity: opts.opacity ?? 1, clippingPlanes: opts.clippingPlanes ?? null,
    depthTest: opts.depthTest ?? true,
  });
  const lines = new InkLines(g, m);
  if (opts.dashed) lines.computeLineDistances();
  return lines;
}

// Polyline helper → segments array
export function polylineSegments(points, closed = false) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const p = points[i], q = points[(i + 1) % n];
    out.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }
  return out;
}
