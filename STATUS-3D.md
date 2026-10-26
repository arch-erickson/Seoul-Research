# STATUS-3D (3D diagrams session)

Updated 2026-10-26 ~03:40. Modules: `src/diagrams/<id>.js` (`export default { id, states, region, create(ctx) }`, ARCHITECTURE §5).
Toolkit: `src/kit3d/` (import `../kit3d/index.js`; map helpers in `src/kit3d/map.js`). Data: `src/data/korea-provinces.json`,
`src/data/seoul-gu.json` (built by `node src/data/build-korea.mjs`, imported as JSON → inlined by esbuild).
Every check below ran with `scripts/shot.mjs --strict --offline` (no file-access exemption, no network: like a
double-click on the college PC). kit3d + finished diagrams contain no fetch/XHR, workers, dynamic import or textures; map data
is imported JSON (inlined). 10:05: budget cut (user is at 76% of the weekly limit). Final set = 10 diagrams in src/diagrams/; the 7 others are CUT and fall back to 2D. Nothing new will be started.

| # | id | status | states | audit (strict) | screenshots (.tmp/3d/) |
|---|---|---|---|---|---|
| 1 | s10-edc | DONE (final polish pending) | 0–5 | 0 violations at every state | s10-edc-0..5.png, s10-edc-5-preview.png, s10-edc-sheet.png, s10-edc-3-t1400.png |
| 2 | s01-map | DONE | 0–1 | 0 / 0 | s01-map-0.png, s01-map-1.png, s01-map-1-preview.png, s01-map-sheet.png |
| 2 | s03-map | DONE | 0–1 | 0 / 0 | s03-map-0.png, s03-map-1.png, s03-map-1-preview.png, s03-map-sheet.png |
| 3 | s12-towers | DONE (lead-reviewed) | 0–2 | 0 at every state | s12-towers-sheet.png (+ builder per-state PNGs) |
| 4 | s14-nanjido | DONE (lead-reviewed) | 0–2 | 0 at every state | s14-nanjido-sheet.png (+ builder per-state PNGs) |
| 5 | s07-balcony | DONE (lead-reviewed) | 0–2 | 0 at every state | s07-balcony-sheet.png (+ builder per-state PNGs) |
| 6 | s11-nowon | DONE (lead-reviewed) | 0–2 | 0 at every state | s11-nowon-0..2.png, s11-nowon-2-preview.png, s11-nowon-sheet.png |
| 7 | s13-rfid | DONE (lead-reviewed; shadows lightened) | 0–3 | 0 at every state | s13-rfid-0..3.png, s13-rfid-3-preview.png, s13-rfid-sheet.png |
| 8 | s16-cheonggye | DONE (lead-reviewed) | 0–2 | 0 at every state | s16-cheonggye-sheet.png (+ builder per-state PNGs) |
| 9 | s15-export | DONE | 0–1 | 0 / 0 | s15-export-0.png, s15-export-1.png, s15-export-1-preview.png, s15-export-1-t1900.png, s15-export-sheet.png |
| 10 | s06-reactor | CUT (budget): 2D fallback (unfinished draft in dev/cut/) | | | |
| 11 | s09-zeb | CUT (budget): 2D fallback (finished, audit-clean draft kept in dev/cut/) | | | |
| 12 | s17-parks | CUT (budget): 2D fallback (finished, audit-clean draft kept in dev/cut/) | | | |
| 13 | s05-trajectory | CUT (budget): 2D fallback (finished, audit-clean draft kept in dev/cut/) | | | |
| 14 | s18-buslane | CUT (budget): 2D fallback (unfinished draft in dev/cut/) | | | |
| 15 | s04-timeline | CUT (budget): 2D fallback | | | |
| 16 | s03-donut | CUT (budget): 2D fallback | | | |

## Notes for MAIN

- **Shading (user request):** model faces render white, sides only very light greys (≈252 / 246 / 237). ARCHITECTURE §6's
  `#F3F2EE` off-white is superseded by the user's instruction.
- **Labels:** MAIN's plain-text label table is applied. One deliberate change: s10-edc uses **"Three floors, turned 45°"**
  instead of "Three floors, each turned 45°". The floors are not each turned 45°; the three-storey volume turns 45° from
  the ground floor to the roof (Fraunhofer ISE: "Der dreigeschossige Baukörper weitet sich durch eine 45°-Drehung nach oben
  konisch aus"). Say if you want the original wording back.
- **s10-edc geometry** follows Fraunhofer ISE's description and site photos: square roof, ground floor square turned 45°,
  acute triangular façades leaning outward, four wedge "wings" rising from the ground to the roof corners (pinwheel), PV on
  roof + wings, piles through the cut landfill to a bearing stratum, geothermal loops (blue). The sun-ray lines from the old
  brief were removed (they read as stray lines in 3D and the new label no longer mentions shading).
- **Leaders over their own context:** three s10 leaders cross the surface their element sits on (piles and loops over the
  ground section, PV over the roof). This is declared per label with `allow`; nothing else is excused.
- **s15-export distances** are computed at runtime from coordinates (great-circle from Seoul City Hall, rounded to 5 km):
  Cheonan about 85 km, Sejong about 125 km, Cheongju about 110 km. State 0 is empty; the map + routes arrive at B4.
- **Maps** frame the mainland + Jeju; the far islands (Baengnyeongdo, Ulleungdo, Dokdo) fall outside the tall s01/s03
  regions. The data keeps them (Dokdo is exempt from island culling).
- **Fonts (user: Montserrat even in the diagrams):** kit3d now embeds Montserrat itself (`src/kit3d/font.js`, latin 400–900,
  ~150 KB once per bundle, family `'Montserrat K3'` first, then `'Montserrat'`). Verified: with NO page fonts
  (`dev/diagram-nofonts.html`) labels render in Montserrat with identical metrics. Labels re-measure when the face is ready.
- **Instances:** each diagram owns one WebGL renderer and calls `forceContextLoss()` in `dispose()`. Please dispose when a
  slide leaves (browsers cap live WebGL contexts at ~16). `quality:'preview'` uses a smaller shadow map and min line width.
- Test module moved to `dev/s00-test.js`; `src/diagrams/` holds only real ids.
- Kit change 09:13: default polygon offset reduced (factor 0.75, units 1.5) so thin slabs no longer show edges beneath them.

## Checkpoints (ARCHITECTURE §12)

- 780b6c2: s10-edc, s01-map, s03-map, s15-export, s11-nowon, s13-rfid (`checkpoint.mjs --no-site`). Each further DONE gets its own checkpoint.

- s05-trajectory, s09-zeb, s17-parks finished (builder audit clean, not lead-reviewed) before the cut; they sit in `dev/cut/`.
  Restoring one is a single move back to `src/diagrams/` (imports there resolve to `../kit3d/index.js` again) if MAIN wants it.

## Contract requests

None.
