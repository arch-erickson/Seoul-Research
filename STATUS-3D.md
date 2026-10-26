# STATUS-3D (3D diagrams session)

Updated 2026-10-26 ~03:40. Modules: `src/diagrams/<id>.js` (`export default { id, states, region, create(ctx) }`, ARCHITECTURE §5).
Toolkit: `src/kit3d/` (import `../kit3d/index.js`; map helpers in `src/kit3d/map.js`). Data: `src/data/korea-provinces.json`,
`src/data/seoul-gu.json` (built by `node src/data/build-korea.mjs`, imported as JSON → inlined by esbuild).
Every check below ran with `scripts/shot.mjs --strict --offline` (no file-access exemption, no network: like a
double-click on the college PC). kit3d + finished diagrams contain no fetch/XHR, workers, dynamic import or textures; map data
is imported JSON (inlined). 09:20: earlier parallel runs were cut off by usage limits; a build-only run (6 at a time, each file kept working on disk) started 09:19 for the 11 remaining diagrams; the lead reviews each as it lands.

| # | id | status | states | audit (strict) | screenshots (.tmp/3d/) |
|---|---|---|---|---|---|
| 1 | s10-edc | DONE (final polish pending) | 0–5 | 0 violations at every state | s10-edc-0..5.png, s10-edc-5-preview.png, s10-edc-sheet.png, s10-edc-3-t1400.png |
| 2 | s01-map | DONE | 0–1 | 0 / 0 | s01-map-0.png, s01-map-1.png, s01-map-1-preview.png, s01-map-sheet.png |
| 2 | s03-map | DONE | 0–1 | 0 / 0 | s03-map-0.png, s03-map-1.png, s03-map-1-preview.png, s03-map-sheet.png |
| 3 | s12-towers | IN PROGRESS (builder continuing its draft) | 0–2 | | |
| 4 | s14-nanjido | IN PROGRESS (builder continuing its draft) | 0–2 | | |
| 5 | s07-balcony | IN PROGRESS (builder continuing its draft) | 0–2 | | |
| 6 | s11-nowon | DONE (lead-reviewed) | 0–2 | 0 at every state | s11-nowon-0..2.png, s11-nowon-2-preview.png, s11-nowon-sheet.png |
| 7 | s13-rfid | DONE (lead-reviewed; shadows lightened) | 0–3 | 0 at every state | s13-rfid-0..3.png, s13-rfid-3-preview.png, s13-rfid-sheet.png |
| 8 | s16-cheonggye | IN PROGRESS (builder continuing its draft) | 0–2 | | |
| 9 | s15-export | DONE | 0–1 | 0 / 0 | s15-export-0.png, s15-export-1.png, s15-export-1-preview.png, s15-export-1-t1900.png, s15-export-sheet.png |
| 10 | s06-reactor | IN PROGRESS / QUEUED (builder) | 0–2 | | |
| 11 | s09-zeb | IN PROGRESS / QUEUED (builder) | 0–2 | | |
| 12 | s17-parks | IN PROGRESS / QUEUED (builder) | 0–1 | | |
| 13 | s05-trajectory | IN PROGRESS / QUEUED (builder) | 0–1 | | |
| 14 | s18-buslane | IN PROGRESS / QUEUED (builder) | 0–1 | | |
| 15 | s04-timeline | IN PROGRESS / QUEUED (builder) | 0–3 | | |
| 16 | s03-donut | IN PROGRESS / QUEUED (builder) | 0–1 | | |

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

## Contract requests

None.
