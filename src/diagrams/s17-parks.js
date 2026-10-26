// s17-parks — park area per person, at true scale.
// Two square plates drawn to the same scale, with the same 1.7 m scale figure on each, like an architect's
// scale comparison. Citywide park area per person (2022) is 17.74 m², a square of side sqrt(17.74) = 4.21 m;
// park area within a five-minute walk is 5.65 m², a square of side sqrt(5.65) = 2.38 m (dossier).
// A 1 m hairline grid on each plate shows the square metres. Citywide plate: neutral white model;
// five-minute plate: red (the focal fact).
// States: 0 empty · 1 the plates open out from their back corners, the figures rise, captions.
import { defineDiagram, THREE, C, LW, ease, sub, labelProp, boxGeo } from '../kit3d/index.js';

const DEG = Math.PI / 180;

// ---- dimensions (m) ----
const S1 = Math.sqrt(17.74);   // 4.21 m: citywide
const S2 = Math.sqrt(5.65);    // 2.38 m: within a five-minute walk
const T = 0.2;                 // plate thickness (top face at y = 0)
const FIG_H = 1.7;             // scale figure height

// ---- view ----
const AZ = 45, EL = 30, SCALE = 75;
const AT = [280, 138];
const az = AZ * DEG;
const DOWN = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));    // ground direction that reads "down" on screen
const RIGHT = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));  // ground direction that reads "right"
const GAP_T = 8.36;                                               // centre-to-centre distance along DOWN
const C2 = DOWN.clone().multiplyScalar(GAP_T);                    // centre of the five-minute plate

// Standing figure, front view, as a closed outline (right half; mirrored for the left). Metres, feet at y 0.
const HALF = [
  [0.050, 1.455], [0.110, 1.437], [0.172, 1.418], [0.203, 1.395], [0.217, 1.352], [0.222, 1.240],
  [0.228, 1.090], [0.233, 0.930], [0.230, 0.835], [0.218, 0.782], [0.200, 0.770], [0.186, 0.792],
  [0.182, 0.880], [0.165, 0.925], [0.161, 0.850], [0.153, 0.620], [0.134, 0.400], [0.114, 0.130],
  [0.112, 0.060], [0.138, 0.032], [0.140, 0.000], [0.046, 0.000], [0.048, 0.060], [0.052, 0.130],
  [0.058, 0.400], [0.050, 0.620], [0.030, 0.770], [0.000, 0.795],
];
const HEAD = { cy: 1.592, rx: 0.088, ry: 0.108 };   // top of head = 1.70

function figureShape() {
  const s = new THREE.Shape();
  const nY = 1.49;
  const nX = HEAD.rx * Math.sqrt(1 - Math.pow((nY - HEAD.cy) / HEAD.ry, 2));
  s.moveTo(nX, nY);
  for (const [x, y] of HALF) s.lineTo(x, y);
  for (let i = HALF.length - 2; i >= 0; i--) s.lineTo(-HALF[i][0], HALF[i][1]);
  s.lineTo(-nX, nY);
  const a0 = Math.atan2((nY - HEAD.cy) / HEAD.ry, -nX / HEAD.rx);   // left neck point on the head ellipse
  const a1 = Math.atan2((nY - HEAD.cy) / HEAD.ry, nX / HEAD.rx);    // right neck point
  s.absellipse(0, HEAD.cy, HEAD.rx, HEAD.ry, a0, a1, true);
  return s;
}

export default defineDiagram({
  id: 's17-parks',
  states: 1,
  region: { x: 120, y: 330, w: 560, h: 600 },
  stage: {
    view: { azimuth: AZ, elevation: EL, target: [0, 0, 0], scale: SCALE, at: AT },
    shadowBox: { min: [-2.6, -T, -2.6], max: [C2.x + 1.6, FIG_H + 0.1, C2.z + 1.6] },
    ground: { y: -T, opacity: 0.14 },
  },
  build(S) {
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.001);   // figures rise out of the plate top
    // a flat cut-out (one face, so the outline is a single clean line)
    const figGeo = new THREE.ShapeGeometry(figureShape(), 20);
    const figMat = S.material(C.model, { unique: true, side: THREE.DoubleSide, clippingPlanes: [clip] });
    figMat.clipShadows = true;

    // one plate: grows from its back corner; grid of 1 m squares on the top face
    function plate(name, side, center, red) {
      const root = S.part(name);
      const grow = new THREE.Group();
      grow.position.set(center.x - side / 2, 0, center.z - side / 2);   // back corner
      root.add(grow);
      const geo = boxGeo(side, T, side).translate(side / 2, -T, side / 2);
      S.solid(geo, red ? { color: C.red, edges: { color: C.redDeep, color2: C.redDeep } } : {}, grow);
      const seg = [];
      const y = 0.002;
      for (let k = 1; k < side; k++) {
        seg.push(k, y, 0.0, k, y, side);
        seg.push(0.0, y, k, side, y, k);
      }
      const grid = S.lines(seg, red ? { width: LW.hair, color: C.redDeep, opacity: 0.55 } : { width: LW.hair, color: C.hair }, grow);
      return { root, grow, grid, gridOpacity: red ? 0.55 : 1 };
    }

    function figure(name, pos) {
      const root = S.part(name);
      const lift = new THREE.Group();
      lift.position.set(pos.x, 0, pos.z);
      root.add(lift);
      const face = new THREE.Group();
      face.rotation.y = az;          // the cut-out faces the viewer
      lift.add(face);
      S.solid(figGeo, {
        material: figMat,
        edges: { color: C.edge, color2: C.edge, width: 1.15, width2: 1.15, clippingPlanes: [clip] },
      }, face);
      return { root, lift };
    }

    const city = plate('Citywide plate', S1, new THREE.Vector3(0, 0, 0), false);
    const walk = plate('Five-minute plate', S2, C2, true);
    const at = (r, d, c = new THREE.Vector3()) => c.clone().addScaledVector(RIGHT, r).addScaledVector(DOWN, d);
    const fig1 = figure('Citywide figure', at(-0.35, 0.9));
    const fig2 = figure('Five-minute figure', at(-0.3, 0.1, C2));

    // captions centred under each plate's front corner
    const lab1 = S.label({
      text: 'Citywide: 17.74 m² per person',
      anchor: new THREE.Vector3(S1 / 2, -T, S1 / 2), anchorObj: city.root,
      place: { mode: 'offset', dx: 0, dy: 18, ax: 'center', ay: 'top' },
    });
    const lab2 = S.label({
      text: 'Within a 5-minute walk: 5.65 m²',
      anchor: new THREE.Vector3(C2.x + S2 / 2, -T, C2.z + S2 / 2), anchorObj: walk.root,
      place: { mode: 'offset', dx: 0, dy: 18, ax: 'center', ay: 'top' },
    });

    // ---- one progress prop for the beat ----
    const setPlate = (p, k, g) => {
      const s = Math.max(1e-3, k);
      p.grow.scale.set(s, 1, s);
      p.root.visible = k > 0.002;
      p.grid.material.setOpacity(p.gridOpacity * g);
      p.grid.visible = g > 0.002;
    };
    const setFig = (f, k) => {
      f.lift.position.y = -(FIG_H + 0.05) * (1 - k);
      f.root.visible = k > 0.002;
    };
    S.anim.prop('build', 0, v => {
      setPlate(city, sub(v, 0.00, 0.46, ease.out), sub(v, 0.36, 0.70, ease.out));
      setPlate(walk, sub(v, 0.12, 0.58, ease.out), sub(v, 0.48, 0.82, ease.out));
      setFig(fig1, sub(v, 0.32, 0.70, ease.out));
      setFig(fig2, sub(v, 0.44, 0.82, ease.out));
    }, { kind: 'reveal', dur: 1700 });
    labelProp(S, 'lab1', lab1, { delay: 1150 });
    labelProp(S, 'lab2', lab2, { delay: 1300 });

    return {
      targets: n => ({ build: n >= 1 ? 1 : 0, lab1: n >= 1 ? 1 : 0, lab2: n >= 1 ? 1 : 0 }),
      plan: (name, from, to, dir) => {
        if (dir >= 0) return null;
        // backwards: captions leave first, then the model folds away
        if (name === 'lab1' || name === 'lab2') return { delay: 0, dur: 280, ease: ease.in };
        if (name === 'build') return { delay: 160, dur: 750, ease: ease.in };
        return null;
      },
    };
  },
});
