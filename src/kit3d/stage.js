// Stage: renderer + scene + orthographic axonometric camera + white-model lighting + DOM label layer
// + render-on-demand loop. One stage per diagram instance.
import * as THREE from 'three';
import { C, LW } from './tokens.js';
import { LabelLayer } from './labels.js';
import { Animator } from './tween.js';
import { sharedLineUniforms, edgeLinesFromGeometry, inkSegments } from './lines.js';
import { runAudit } from './audit.js';
import { ensureMontserrat, montserratReady } from './font.js';

const DEG = Math.PI / 180;

export function createStage(ctx, opts = {}) {
  ensureMontserrat();
  const region = opts.region;
  const W = region.w, H = region.h;
  const quality = ctx.quality || 'high';
  const container = ctx.container;
  const pixelRatio = ctx.pixelRatio || window.devicePixelRatio || 1;

  const root = document.createElement('div');
  root.className = 'k3-root';
  root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
  container.appendChild(root);

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.localClippingEnabled = true;
  const shadows = opts.shadows !== false;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;left:0;top:0;display:block;';
  root.appendChild(canvas);

  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  // ---- camera ----
  const view = Object.assign({ azimuth: 45, elevation: 30, target: [0, 0, 0], scale: 10, at: [W / 2, H / 2] }, opts.view || {});
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
  function applyView() {
    const az = view.azimuth * DEG, el = view.elevation * DEG;
    const t = new THREE.Vector3().fromArray(view.target);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const dist = opts.cameraDistance || 2000;
    camera.position.copy(t).addScaledVector(dir, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(t);
    const s = view.scale;
    camera.left = -view.at[0] / s;
    camera.right = (W - view.at[0]) / s;
    camera.top = view.at[1] / s;
    camera.bottom = -(H - view.at[1]) / s;
    camera.near = 1;
    camera.far = dist * 2 + 2000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    placeLights();
  }

  // ---- lights (defined relative to the camera so every azimuth shades alike) ----
  const L = Object.assign({ hemi: 2.83, key: 0.4, fill: 0.0, sky: 0xffffff, ground: 0xf7f6f3 }, opts.lights || {});
  const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemi);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, L.key);
  const fill = new THREE.DirectionalLight(0xffffff, L.fill);
  scene.add(key, key.target, fill, fill.target);
  key.castShadow = shadows;
  const sm = quality === 'preview' ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.radius = opts.shadowRadius ?? 5;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.intensity = opts.shadowIntensity ?? 0.9;
  const shadowBox = opts.shadowBox || { min: [-60, -10, -60], max: [60, 60, 60] };
  function placeLights() {
    const az = view.azimuth * DEG;
    // camera basis on the ground plane
    const toCam = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new THREE.Vector3(0, 1, 0);
    const kd = new THREE.Vector3().addScaledVector(up, opts.keyUp ?? 1.0).addScaledVector(right, -(opts.keyLeft ?? 0.62)).addScaledVector(toCam, opts.keyFront ?? 0.42).normalize();
    const fd = new THREE.Vector3().addScaledVector(up, 0.35).addScaledVector(right, 1.0).addScaledVector(toCam, 0.5).normalize();
    const c = new THREE.Vector3(
      (shadowBox.min[0] + shadowBox.max[0]) / 2, (shadowBox.min[1] + shadowBox.max[1]) / 2, (shadowBox.min[2] + shadowBox.max[2]) / 2);
    const rad = new THREE.Vector3().fromArray(shadowBox.max).sub(new THREE.Vector3().fromArray(shadowBox.min)).length() / 2;
    key.position.copy(c).addScaledVector(kd, rad * 3);
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad;
    sc.near = rad * 0.5; sc.far = rad * 6;
    sc.updateProjectionMatrix();
    fill.position.copy(c).addScaledVector(fd, rad * 3);
    fill.target.position.copy(c);
    key.updateMatrixWorld(); key.target.updateMatrixWorld();
    fill.updateMatrixWorld(); fill.target.updateMatrixWorld();
    key.shadow.needsUpdate = true;
  }

  // ---- shadow-catcher ground ----
  let ground = null;
  if (shadows && opts.ground !== false) {
    const gy = (opts.ground && opts.ground.y) || 0;
    const gs = (opts.ground && opts.ground.size) || 2000;
    ground = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), new THREE.ShadowMaterial({ opacity: (opts.ground && opts.ground.opacity) ?? 0.16, color: 0x3a3a3c }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = gy - 0.01;
    ground.receiveShadow = true;
    ground.userData.auditIgnore = true;
    ground.renderOrder = -1;
    scene.add(ground);
  }

  // ---- labels ----
  const stage = {
    THREE, ctx, quality, renderer, scene, world, camera, view, W, H, container, root, key, fill, hemi, ground,
    partNames: new Map(), _nextPart: 1, disposed: false,
  };
  const labels = new LabelLayer(stage);
  labels.setDesignSize(W, H);
  root.appendChild(labels.el);
  stage.labels = labels;
  const anim = new Animator(stage);
  anim.reduced = !!ctx.reducedMotion;
  stage.anim = anim;

  // ---- sizing ----
  let cw = W, ch = H, viewScale = 1;
  function setSize(w, h) {
    cw = w || W; ch = h || H;
    viewScale = Math.min(cw / W, ch / H);
    const pr = pixelRatio;
    renderer.setPixelRatio(pr);
    // render the design frame at viewScale, centred in the container
    const dw = Math.round(W * viewScale), dh = Math.round(H * viewScale);
    renderer.setSize(dw, dh, false);
    canvas.style.width = dw + 'px';
    canvas.style.height = dh + 'px';
    const ox = Math.round((cw - dw) / 2), oy = Math.round((ch - dh) / 2);
    canvas.style.left = ox + 'px';
    canvas.style.top = oy + 'px';
    labels.el.style.transform = `translate(${ox}px,${oy}px) scale(${viewScale})`;
    sharedLineUniforms.uPxScale.value = pr * viewScale;
    sharedLineUniforms.uMinPx.value = quality === 'preview' ? 0.7 : 0.55;
  }
  setSize(container.clientWidth || W, container.clientHeight || H);

  // ---- render loop (render on demand) ----
  let rafPending = false, looping = false;
  const tickers = new Set();
  function renderNow() {
    if (stage.disposed) return;
    sharedLineUniforms.uPxScale.value = pixelRatio * viewScale;
    sharedLineUniforms.uMinPx.value = quality === 'preview' ? 0.7 : 0.55;
    if (stage.beforeRender) stage.beforeRender();
    labels.update();
    renderer.render(scene, camera);
  }
  function frame(now) {
    rafPending = false;
    if (stage.disposed || stage.frozen) return;
    let more = anim.tick(now);
    for (const t of [...tickers]) { if (t(now) === false) tickers.delete(t); else more = true; }
    renderNow();
    if (more) { rafPending = true; requestAnimationFrame(frame); }
    else looping = false;
  }
  function requestRender() {
    if (rafPending || stage.disposed) return;
    rafPending = true;
    requestAnimationFrame(frame);
  }
  function startLoop() { looping = true; requestRender(); }

  // ---- projection ----
  const _p = new THREE.Vector3();
  function project(v) {
    _p.copy(v).project(camera);
    return { x: (_p.x + 1) / 2 * W, y: (1 - _p.y) / 2 * H, z: _p.z };
  }

  // ---- parts ----
  // A part is a Group carrying an audit id; its meshes get matte materials and ink edges.
  function part(name, parent = world) {
    const g = new THREE.Group();
    const id = stage._nextPart++;
    g.userData.partId = id;
    g.userData.partName = name;
    stage.partNames.set(id, name);
    g.name = name;
    parent.add(g);
    return g;
  }

  const matCache = new Map();
  function material(color = C.model, o = {}) {
    const keyM = color + JSON.stringify(o);
    if (!o.unique && matCache.has(keyM)) return matCache.get(keyM);
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o.roughness ?? 0.9, metalness: 0, flatShading: o.flat ?? false,
      polygonOffset: true, polygonOffsetFactor: o.offsetFactor ?? 0.75, polygonOffsetUnits: o.offsetUnits ?? 1.5,
      side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    });
    if (o.clippingPlanes) m.clippingPlanes = o.clippingPlanes;
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
    if (!o.unique) matCache.set(keyM, m);
    return m;
  }

  // mesh + edges inside a part. opts: { material, color, edges:false|{...}, castShadow, receiveShadow, creaseAngle }
  function solid(geometry, opts = {}, parent) {
    const g = new THREE.Group();
    const mat = opts.material || material(opts.color || C.model, opts.matOpts || {});
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    g.add(mesh);
    g.userData.mesh = mesh;
    if (opts.edges !== false) {
      const eo = opts.edges || {};
      const lines = edgeLinesFromGeometry(geometry, {
        color: eo.color ?? C.edge, color2: eo.color2 ?? C.crease,
        width: eo.width ?? LW.silhouette, width2: eo.width2 ?? LW.crease,
        creaseAngle: eo.creaseAngle ?? opts.creaseAngle ?? 28,
        clippingPlanes: eo.clippingPlanes ?? (opts.matOpts && opts.matOpts.clippingPlanes) ?? null,
      });
      g.add(lines);
      g.userData.lines = lines;
    }
    if (parent) parent.add(g);
    return g;
  }

  function lines(segments, o = {}, parent) {
    const l = inkSegments(segments, o);
    if (parent) parent.add(l);
    return l;
  }

  function resize(w, h) { setSize(w, h); requestRender(); }

  function dispose() {
    if (stage.disposed) return;
    anim.stop();
    stage.disposed = true;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    for (const m of matCache.values()) m.dispose();
    if (key.shadow && key.shadow.map) key.shadow.map.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) {}
    labels.dispose();
    root.remove();
  }

  function audit(o) { return runAudit(stage, o); }

  // Dev: freeze the loop and show the frame `ms` after the current transition started.
  function scrub(ms) {
    stage.frozen = true;
    const t0 = 1e7;
    anim.tick(t0);
    for (const t of [...tickers]) t(t0);
    anim.tick(t0 + ms);
    for (const t of [...tickers]) t(t0 + ms);
    renderNow();
  }

  // Fonts change label metrics: re-measure once they are ready.
  montserratReady().then(() => { if (!stage.disposed) { labels.remeasure(); requestRender(); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!stage.disposed) { labels.remeasure(); requestRender(); } });

  Object.assign(stage, {
    applyView, placeLights, setSize, renderNow, requestRender, startLoop, project, part, material, solid, lines,
    resize, dispose, audit, scrub, tickers, get viewScale() { return viewScale; },
    addTicker(fn) { tickers.add(fn); startLoop(); },
    label: (o) => labels.add(o),
  });
  applyView();
  return stage;
}
