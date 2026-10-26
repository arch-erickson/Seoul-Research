// s03-map — small South Korea map (same look as s01-map), no labels: the HTML caption below it carries the facts
// ("Seoul is 0.6% of South Korea's land area and 18% of its population"). State 1: outlines draw in, Seoul rises.
import { defineDiagram, ease } from '../kit3d/index.js';
import { buildKoreaMap, projectLL } from '../kit3d/map.js';

const REGION = { x: 1300, y: 380, w: 520, h: 480 };
const EL = 64;

function frame() {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const lon of [126.05, 126.5, 127.5, 128.5, 129.6]) for (const lat of [33.15, 35.5, 38.62]) {
    const [x, n] = projectLL(lon, lat);
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, n); maxy = Math.max(maxy, n);
  }
  const sEl = Math.sin(EL * Math.PI / 180);
  const top = 16, bottom = REGION.h - 16, left = 16, right = REGION.w - 16;
  const scale = Math.min((right - left) / (maxx - minx), (bottom - top) / ((maxy - miny) * sEl));
  const cx = (minx + maxx) / 2, cn = (miny + maxy) / 2;
  return { scale, target: [cx, 0, -cn], at: [(left + right) / 2, (top + bottom) / 2] };
}
const F = frame();

export default defineDiagram({
  id: 's03-map',
  states: 1,
  region: REGION,
  stage: {
    view: { azimuth: 0, elevation: EL, target: F.target, scale: F.scale, at: F.at },
    shadowBox: { min: [F.target[0] - 380, -5, F.target[2] - 380], max: [F.target[0] + 380, 30, F.target[2] + 380] },
    ground: { y: 0, opacity: 0.09 },
  },
  build(stage) {
    // bounds trimmed to the region so outlying islands never peek in at the edge
    const map = buildKoreaMap(stage, { thickness: 6, seoulRise: 5, bounds: [125.95, 32.8, 129.9, 38.9], outlineWidth: 0.75 });
    stage.anim.prop('map', 0, v => map.reveal(v), { kind: 'reveal', dur: 1100 });
    stage.anim.prop('seoul', 0, v => map.seoulRise(ease.out(v)), { kind: 'reveal', dur: 700 });
    return {
      targets: n => ({ map: n >= 1 ? 1 : 0, seoul: n >= 1 ? 1 : 0 }),
      plan(name, from, to, dir) {
        if (dir < 0) return null;
        return { seoul: { delay: 950 } }[name] || null;
      },
    };
  },
});
