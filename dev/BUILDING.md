# Building a 3D diagram — guide for the 3D session (and its helpers)

Workspace: `C:\Users\erick\AppData\Local\Temp\claude\seoul-deck\` (bash: `/c/Users/erick/AppData/Local/Temp/claude/seoul-deck`).
Read first: `ARCHITECTURE.md` (§1 design system + HARD no-overlap rule, §5 module contract, §6 visual language) and your
diagram's section in `spec/diagram-briefs.md`. Facts/labels come only from the brief (which quotes the dossier).

**File ownership.** You may create/edit only your own `src/diagrams/<id>.js` and files under `.tmp/3d/`. Do NOT edit
`src/kit3d/**`, `dev/**`, `scripts/**`, `spec/**`, `ARCHITECTURE.md` or anything owned by other sessions. Need a helper? Put
it inside your diagram file. Found a kit bug or need a kit feature? Work around it locally and report it in your final answer.
Never run `npm install`. There is no git — never delete files you didn't create.

## Commands (run from the workspace root)

```bash
node scripts/build-diagram.mjs <id>                                    # bundle → dev/build/<id>.js (re-run after every edit)
node scripts/shot.mjs dev/diagram.html --query "d=<id>&state=<n>&static=1" --out .tmp/3d/<id>-<n>.png
node scripts/shot.mjs dev/diagram.html --query "d=<id>&state=<n>&static=1&audit=1" --dom          # audit JSON
node scripts/shot.mjs dev/diagram.html --query "d=<id>&sheet=1" --out .tmp/3d/<id>-sheet.png      # every state + audit verdicts
node scripts/shot.mjs dev/diagram.html --query "d=<id>&state=<n>&static=1&scale=0.25" --w 480 --h 270 --out .tmp/3d/<id>-<n>-preview.png
node scripts/shot.mjs dev/diagram.html --query "d=<id>&state=<n>&t=450" --out .tmp/3d/<id>-<n>-t450.png   # frame 450 ms into the (n-1)→n transition
```
Add `--strict` to any of these to run exactly like a double-clicked file (required for the final check).
Extra query flags: `&frame=1` dashed region outline, `&ctx=1` grey placeholders for the HTML the MAIN session puts around
your region (judge composition with it), `&overlay=1` (with `audit=1`) draws label boxes, `&from=<a>` start state for `t=`.
Open every PNG you produce with the Read tool and look at it critically. Renders take ~8 s; SwiftShader is CPU-heavy, so run
renders one at a time (never more than 2 concurrently per helper). A blank/white render or `document.title=error` means a JS
error: the error text is drawn top-left of the page.

## Module shape

```js
import { defineDiagram, THREE, C, LW, MOTION, ease, sub, lerp, labelProp, setOpacity,
         boxGeo, prismGeo, loftGeo, rectPts, regularPolygon, rotatePts, makeWipe, rng } from '../kit3d/index.js';

export default defineDiagram({
  id: 's07-balcony', states: 2, region: { x: 100, y: 330, w: 760, h: 640 },   // must match spec/timing.json
  stage: {
    view: { azimuth: 35, elevation: 30, target: [0, 20, 0], scale: 9, at: [300, 360] }, // ortho axo camera
    shadowBox: { min: [-30, 0, -20], max: [30, 50, 20] },      // tight world box around the model (crisp shadows)
    // ground: { y: 0, opacity: 0.16 } | false, shadows: true, lights: {...}
  },
  build(stage, ctx) {
    const slab = stage.part('Apartment slab');            // a "part" = Group with an audit id + name
    stage.solid(boxGeo(40, 45, 12), {}, slab);             // mesh (matte off-white) + automatic ink edges
    const pv = stage.part('PV');                           // focal parts: C.red faces, C.redDeep edges
    stage.solid(geo, { color: C.red, edges: { color: C.redDeep, color2: C.redDeep } }, pv);
    stage.lines([x0,y0,z0, x1,y1,z1, ...], { width: LW.hair, color: C.hair }, slab);   // hairline detail
    const lab = stage.label({ text: 'Mini-PV on balcony railings', anchor: new THREE.Vector3(...), anchorObj: pv,
                              place: { mode: 'column', x: 560 }, leaderTone: 'red' });
    // animator props: name, initial value, apply(v), { kind:'reveal'|'fade'|'move', dur, delay }
    stage.anim.prop('rise', 0, v => { slab.scale.y = Math.max(1e-3, v); }, { kind: 'reveal', dur: 1000 });
    labelProp(stage, 'lab', lab, { delay: 900 });
    return {
      targets: n => ({ rise: n >= 1 ? 1 : 0, lab: n >= 2 ? 1 : 0 }),        // value of every prop at state n
      plan: (name, from, to, dir, n, prevState) => ({ delay, dur, ease }),   // optional per-transition overrides
    };
  },
});
```

`defineDiagram` implements the contract (`setState(n,{instant})` idempotent from any state, forward or backward;
`resize`, `renderOnce`, `audit`, `dispose`). Build everything once in `build()`; states only change prop values.
A prop's `apply(v)` must be a pure function of `v` (so jumping/reversing works). Use one 0..1 "progress" prop per beat and
derive staggered sub-motions inside `apply` with `sub(p, a, b, ease.out)`.

## Kit reference (src/kit3d)

- `stage.part(name, parent?)` → Group; every mesh/line under it belongs to that part for the audit (names appear in violations).
- `stage.solid(geometry, { color, material, matOpts:{clippingPlanes, side, unique}, edges:false|{color,color2,width,width2,creaseAngle}, castShadow, receiveShadow }, parent)`
  → Group(mesh + edge lines). Edges are automatic: silhouettes 1.6 px ink, creases 0.9 px softer ink, smooth-surface
  edges appear only on the silhouette (curved masses outline correctly from any view). `creaseAngle` (default 28°).
- `stage.lines(segments, { width, color, dashed, dashSize, gapSize, opacity, clippingPlanes }, parent)` — plain fat lines
  (screen-space px). `polylineSegments(points, closed)` converts Vector3 lists.
- `stage.material(color, opts)` cached matte MeshStandardMaterial (roughness .9, polygon offset so edges win).
- `stage.label({...})` DOM label. Options: `text`, `sub`, `tone` ('ink'|'red'|'blue'|'muted' – the name colour),
  `subTone`, `leaderTone`, `size`(22) `subSize`(16) `weight`(600) `caps`, `anchor` (Vector3 | Object3D | fn(v)→Vector3),
  `anchorObj` (the part the leader may touch), `allow` ([parts] the label may deliberately sit on — rare, e.g. a number
  inside a ring), `place`:
  - `{ mode:'column', x, side:'right'|'left' }` — one label column; first line vertically centred on the anchor, horizontal leader.
  - `{ mode:'fixed', x, y, ax:'left'|'center'|'right', ay:'top'|'middle'|'bottom'|'first' }` + `leader:'straight'|'v'|'shoulder'|false`.
  - `{ mode:'offset', dx, dy, ax, ay }` — positioned relative to the projected anchor, no leader by default.
  `labelProp(stage, propName, label, {delay, dur})` registers its fade (0..1) as an animator prop.
- `setOpacity(part, v)` fade a whole part (meshes + lines). Prefer constructive motion (rise, extrude via `scale.y`,
  clipping wipes with `makeWipe`, rotation, sliding) over opacity fades: a half-transparent solid shows its hidden edges.
- Geometry: `boxGeo(w,h,d)` (stands on y=0), `prismGeo([[x,z],...], h, y0)` (extruded footprint), `loftGeo(bottomPts, topPts, y0, y1)`
  (tapered/flared solids, same vertex count), `regularPolygon`, `rotatePts`, `rectPts`, `rng(seed)` deterministic random.
- Tokens: `C.model` (#FFFFFF), `C.modelCut` (section poché), `C.red/redDeep`, `C.blue/blueDeep`, `C.hair`, `C.outline`,
  `LW.silhouette/crease/hair`, `MOTION.short/base/long/stagger`.
- World units: metres. Ground = y 0. y is up. The camera is orthographic; `view.scale` = px per metre, `view.at` = the
  design-px point where `view.target` lands. Azimuth 45° = symmetric axo; use 30–40° when 45°-rotated geometry would be
  seen edge-on. Elevation 25–35° (2:1 dimetric ≈ 30°).
- Lighting/shadows are calibrated to the USER'S EXPLICIT REQUEST: faces read WHITE, the other sides only very light greys with
  minor difference (top ≈ 252, lit side ≈ 246, shade side ≈ 237; curved surfaces almost flat). Form is carried by the ink
  edges, not by shading. Don't override lights, don't darken materials (C.model is #FFFFFF; C.modelCut #EFEEEB for section
  cuts). Set a tight `shadowBox` around the model.
- `ease.out` (arrivals), `ease.in` (departures), `ease.inOut` (internal moves); `sub(p,a,b,fn)` sub-range of a progress.

## User rules that override the brief

- **Label text = the table below (authoritative, replaces the brief's label strings).** No em dashes (—) or en dashes (–)
  anywhere. Plain, simple words; short labels that name the thing; no slogans, no "X, not Y", no script sentences. Ranges use
  "to". Hyphens inside words, middots (·) and colons are fine. If a label does not fit, shorten it in the same plain style.
- **Shading stays white** (see Lighting above): never darken materials or add contrast per diagram.
- **Pure HTML, nothing installed** (ARCHITECTURE.md hard-constraint box): no fetch/XHR, no workers, no dynamic import, no
  textures, JSON only via `import`. Final check of every state uses `--strict` (no file-access exemption), e.g.
  `node scripts/shot.mjs dev/diagram.html --query "d=<id>&sheet=1" --strict --out .tmp/3d/<id>-sheet.png`.
  Headless only: never run .cmd/.bat, never start a server, never open a visible window.
- Test modules live in `dev/` (e.g. `dev/s00-test.js`); `src/diagrams/` holds only real diagram ids.
- **Montserrat everywhere (user):** the kit embeds Montserrat (`src/kit3d/font.js`, family `FONT.family`). Any DOM text a
  diagram creates itself (chips, keys, display readouts) must use `font-family: ${FONT.family}`, never a bare 'Montserrat'
  or a system font. Never draw text into canvas textures.

| id | labels (exact text) |
|---|---|
| s10-edc | "Old Nanjido landfill" · "Piles reach solid ground" · "Three floors, each turned 45°" · "Solar panels on the roof and wings" · "Geothermal heating and cooling" |
| s01-map | "SEOUL" · "9.4 million people · 37.57°N 126.98°E" |
| s03-map | (no labels) |
| s12-towers | Amorepacific: "Central courtyard" · "Three large openings" · "Sun-shading fins" · "About 22 floors · 7,000 to 8,000 workers"; Lotte: "Wind turbines near the top" · "Solar panels" · "720 geothermal wells, about 200 m deep" · "Han River water for heating and cooling" · "555 m · 123 floors" |
| s14-nanjido | "Layers of trash, about 90 m high" · "Sealed cap" · "Gas collection wells" · "Haneul Park on top" |
| s07-balcony | "Solar panels on balcony railings" · "A kit renters can install" |
| s11-nowon | "Geothermal field" (sub "About 130 heat pumps") · "Structure" · "Passive House envelope" (sub "Insulation, airtight layer, triple glazing") · "Heat recovery ventilation" · "Solar panels" (sub "1,300 to 1,800 panels") |
| s13-rfid | "Tap your card" · "The bin weighs it" · "You pay by weight" (display text "4.2 kg") |
| s16-cheonggye | before: "Elevated highway" · "Stream buried underneath"; after: "Stream opened up" · "Planted banks and walkways" |
| s15-export | city name + "about 85 km" style ("about", not "≈"); optional "Capital region" |
| s06-reactor | "Output of one nuclear reactor: 2 million TOE a year" · "1.68 million households plus building retrofits" |
| s09-zeb | "Grade 5: 20 to 40%" · "Grade 4" · "Grade 3" · "Grade 2" · "Grade 1: over 100%" · axis "Share of energy the building makes itself" · state 2 "Required for new private buildings from 2025" |
| s17-parks | "Citywide: 17.74 m² per person" · "Within a 5-minute walk: 5.65 m²" |
| s05-trajectory | "52.34 Mt in 2005" · "Half by 2033" · "Net zero by 2050" |
| s18-buslane | "Bus lanes in the middle of the road" · "Island bus stops" · key "Blue: main routes · Green: local · Red: express · Yellow: downtown loop" |
| s04-timeline | 1978 "Nanjido becomes Seoul’s main dump" · 1993 "Dump closes" · 2002 "Reopens as World Cup Park" · 2011 "Fukushima and a Seoul blackout" |
| s03-donut | "67%" · "BUILDINGS" |

## Quality bar (what reviewers check)

1. **Accuracy** — geometry plausibly true to the real building/system described in the brief; every label exactly the brief's
   text (or shorter); no invented numbers. Red `#CD2E3A` only on the focal information, blue `#0047A0` only where the brief
   says; max 2 red elements per slide.
2. **Elegance** — a white architectural study model: big, calm, well-composed hero; crisp ink silhouettes, softer creases,
   hairline detail used sparingly and evenly; no clutter, no colour decoration, no gradients/glow; generous whitespace.
   The model should fill the region sensibly (labels included) — not tiny, not cropped. Think like an architect drawing a
   competition axonometric.
3. **Labels** — Montserrat, 22 px name / 16 px sub; one tidy column with horizontal leaders where possible; leaders never
   cross other geometry, labels or leaders; ≥ 24 px clear of region edges; labels appear after their part settles.
4. **Audit** — `violations: []` at EVERY state (check the sheet render + `--dom` JSON). Don't game it with `allow`.
5. **Preview** — at `scale=0.25` the composition and the red/blue focal element still read.
6. **Motion** — every beat's transition is calm and legible (ease-out arrivals, ease-in departures, 400–1200 ms, stagger
   60–90 ms, no bounce); check a mid-transition frame with `t=`. Backward transitions work (`from=` a higher state).
7. **Contract** — `states`/`region` match `spec/timing.json`; no network, no textures, no external files; transparent background.
