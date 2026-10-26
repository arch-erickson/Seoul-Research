// s01-map — title slide: South Korea from KOSTAT 2018 provinces (accurate, smoothed), thin light-grey outlines,
// Seoul raised in red. State 1: outlines draw in, the land fills, Seoul rises, label arrives.
import { defineDiagram, THREE, ease, sub, labelProp } from '../kit3d/index.js';
import { buildKoreaMap, llToWorld, projectLL } from '../kit3d/map.js';

const REGION = { x: 1290, y: 110, w: 540, h: 880 };
const EL = 64;                                   // gentle tilt (90 = straight down)

// frame the mainland + Jeju (the far islands — Baengnyeongdo, Ulleungdo, Dokdo — fall outside this tall region)
function frame() {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const lon of [126.05, 126.5, 127.5, 128.5, 129.6]) for (const lat of [33.15, 35.5, 38.62]) {
    const [x, n] = projectLL(lon, lat);
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, n); maxy = Math.max(maxy, n);
  }
  const sEl = Math.sin(EL * Math.PI / 180);
  const top = 170, bottom = REGION.h - 30, left = 40, right = REGION.w - 40;
  const scale = Math.min((right - left) / (maxx - minx), (bottom - top) / ((maxy - miny) * sEl));
  const cx = (minx + maxx) / 2, cn = (miny + maxy) / 2;
  return { scale, target: [cx, 0, -cn], at: [(left + right) / 2, (top + bottom) / 2] };
}
const F = frame();

export default defineDiagram({
  id: 's01-map',
  states: 1,
  region: REGION,
  stage: {
    view: { azimuth: 0, elevation: EL, target: F.target, scale: F.scale, at: F.at },
    shadowBox: { min: [F.target[0] - 380, -5, F.target[2] - 380], max: [F.target[0] + 380, 30, F.target[2] + 380] },
    ground: { y: 0, opacity: 0.09 },
  },
  build(stage) {
    const map = buildKoreaMap(stage, { thickness: 6, seoulRise: 5, bounds: [125.8, 32.8, 130.2, 38.9] });
    stage.anim.prop('map', 0, v => map.reveal(v), { kind: 'reveal', dur: 1200 });
    stage.anim.prop('seoul', 0, v => map.seoulRise(ease.out(v)), { kind: 'reveal', dur: 700 });
    const cityHall = llToWorld(126.978, 37.5665, 6 + 5);
    const lab = stage.label({
      text: 'SEOUL', sub: '9.4 million people · 37.57°N 126.98°E',
      tone: 'red', caps: true, size: 22, weight: 800, subSize: 17, subWeight: 500,
      anchor: cityHall, anchorObj: map.seoulPart, allow: [map.landPart],
      place: { mode: 'fixed', x: 40, y: 40, ax: 'left', ay: 'top' }, leader: 'v', leaderTone: 'red', gap: 18,
    });
    labelProp(stage, 'label', lab);
    return {
      targets: n => ({ map: n >= 1 ? 1 : 0, seoul: n >= 1 ? 1 : 0, label: n >= 1 ? 1 : 0 }),
      plan(name, from, to, dir) {
        if (dir < 0) return null;
        return { seoul: { delay: 1050 }, label: { delay: 1550 } }[name] || null;
      },
    };
  },
});
