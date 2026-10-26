# 3D Diagram Briefs — build in this order (worst current diagram → best)

Read `ARCHITECTURE.md` first (contract, visual language, hard no-overlap rule, module interface).
Facts: only from `01-Seoul-Research-Dossier.md` in the course folder. Labels must use the exact text given here (or shorter) — Montserrat.
"HTML around" = text the MAIN session renders next to your region. Do not repeat it inside the diagram.

Global intent: a **white architectural study model** — bright white light, matte off-white masses, crisp ink edges at elegant lineweights, and red `#CD2E3A` / blue `#0047A0` **only** on the information that matters. Axonometric (orthographic) cameras unless a brief says otherwise. Calm, precise motion. Every state must pass the overlap audit at 1920×1080 **and** read at a ~480 px-wide preview.

Where a published starting point exists, start from it rather than drawing from scratch:
- **diagram-design** skill (cloned at `C:\Users\erick\AppData\Local\Temp\claude\extrepo\diagram-design`, already skinned to this palette in `skills/diagram-design/references/style-guide.md`): its `type-exploded.md` (2:1 dimetric projection, part/label/leader rules, equal explode gaps), `type-layers.md`, `type-axonometric-plan.md`, `type-timeline.md` and `scripts/axonometry.py` / `scripts/build-exploded-examples.py` are the reference grammar for exploded views, layer stacks and labels. Its rule "verified label geometry" is the same as our no-overlap rule.
- **three.js examples** shipped in `node_modules/three/examples/jsm/`: `lines/LineSegments2.js` + `LineMaterial.js` + `LineSegmentsGeometry.js` (fat screen-space lines), `renderers/CSS2DRenderer.js` (DOM labels), `geometries/` (ExtrudeGeometry via `three`), `utils/BufferGeometryUtils.js`, `math/` helpers.
- **Real geodata** (see s01-map) — never hand-draw a coastline.
- **animation-kit** (cloned at `C:\Users\erick\AppData\Local\Temp\claude\extrepo\animation-kit`): `skills/figma-motion/references/easing-and-springs.md` for the easing rules.

---

## 1. `s10-edc` — Seoul Energy Dream Center (the user explicitly called the current one bad)
Region `{x:100, y:300, w:1110, h:680}` · states 0–5 · slide beats B2→1, B3→2, B4→3, B5→4, B6→5.
HTML around: headline above; data column to the right (x ≥ 1240): "3,500 m²", "280,000 kWh / yr", "Geothermal", "KGBC + PH" with captions. Don't repeat those numbers.

Facts: completed 2012 · World Cup Park, Mapo-gu, **on the former Nanjido landfill** · design team led by **Fraunhofer ISE** (German–Korean team) · ~3,500 m² renewable-energy exhibition/education centre · **square plan, three storeys widening conically upward and outward, rotated 45° (pinwheel-like, oblique outer walls)** · **wedge-shaped, upward-tilted roof projections ("wings") along the façades: they shade the glazing, shelter the entrance, and carry PV** · envelope to Passive House standard · white marble façade · **geothermal** heating & cooling · grid-connected PV on roof, overhangs and a small ground array supplying the full ~280,000 kWh/yr · subsoil cannot bear load → **piles through the waste onto a reinforced-concrete base plate**.

Build a sectional axonometric model (cut through the ground so the strata are visible):
- 1 — ground plane + the landfill revealed as a cut block of compacted waste strata (fine horizontal bands, matte white/grey, no colour). Label: **"Compacted waste — former Nanjido landfill"**.
- 2 — piles drive down through the waste to a firm stratum; the base plate settles on top. Label: **"Piles to bearing strata"**.
- 3 — three floor plates rise and **rotate into their 45° offsets** so the pinwheel/cone reads in 3D (this is what 2D couldn't show). Label: **"Three storeys, rotated 45°"**.
- 4 — the wing overhangs swing up and out; PV populates roof and wings (PV is the focal element → **red**); a few precise sun-ray lines show the wings shading the glazing. Label: **"PV + fixed solar shading"**.
- 5 — geothermal loops descend into the ground (thin lines, **blue** = the ground-source system), building is complete. Label: **"Geothermal loops"**.
Labels: one column, horizontal leaders, never crossing geometry. Make the building the hero — big, centred-left, generous.

## 2. Map foundation → `s01-map` (title) and `s03-map` (small), reused by `s15-export`
The user's words: the current map is "too sharp around the edges, smooth it out and show the other states as thin outlined light gray, the map should also be very accurate rather than low polygon — accurate but smooth around the corners."

Data (verified reachable, all free to use):
- **KOSTAT 2018 provinces** (survey-grade, 17 first-level divisions incl. Sejong): `https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2018/json/skorea-provinces-2018-geo.json` (7.5 MB GeoJSON)
- Seoul's 25 districts: `https://cdn.jsdelivr.net/gh/southkorea/seoul-maps@master/kostat/2013/json/seoul_municipalities_geo_simple.json`
- Fallback / cross-check: geoBoundaries `gbOpen/KOR/ADM1` (Natural Earth source, public domain) via `https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM1/`; world-atlas `countries-50m.json` already downloaded to `C:\Users\erick\AppData\Local\Temp\claude\nettest\countries.json`.
Pipeline (write as a reproducible Node script under `src/data/` or `dev/`, commit the output JSON): project (equirectangular scaled by cos 36° is fine at this extent, or a proper conic) → simplify gently (Visvalingam/Douglas-Peucker at a tolerance that keeps the coastline's character — peninsulas, the southwest archipelago's main islands, Jeju, Ulleungdo) → cull islands below a small area threshold → **smooth** (e.g. 2 iterations of Chaikin, or centripetal Catmull-Rom resampling) so no vertex reads as a sharp angle at slide scale → round joins/caps on lines. Keep Seoul's boundary and its shared edges with Gyeonggi exact (topology-preserving: smooth shared arcs once, not each polygon separately, so borders never gap or overlap). Output small JSON (aim < 300 KB total) to `src/data/korea-provinces.json`, `src/data/seoul-gu.json`, plus a shared builder in `src/kit3d/map.js`.
Look: all provinces as **thin light-grey outlines** (~#C8C7C3, ≈0.8 px) on a near-white fill; **Seoul filled red**, gently raised as a thin plate; very slight orthographic tilt (not a globe, not dramatic). No North Korea land mass beyond the peninsula's southern edge — South Korea only.
- `s01-map` region `{x:1290, y:110, w:540, h:880}` · states 0–1 · B1→1. State 1: outlines draw in, Seoul rises in red. Labels: **"SEOUL"** (red, small caps) and **"9.4 million people · 37.57°N 126.98°E"** with a leader to Seoul.
- `s03-map` region `{x:1300, y:380, w:520, h:480}` · states 0–1 · B2→1. Same look, smaller; no labels (the HTML caption below it says "Seoul is 0.6% of South Korea's land area and 18% of its population.").

## 3. `s12-towers` — Amorepacific HQ vs Lotte World Tower
Region `{x:100, y:412, w:1720, h:420}` · states 0–2 · B2→1 (Amorepacific), B3→2 (Lotte).
HTML around: column titles "AMOREPACIFIC HQ" (x 120) / "LOTTE WORLD TOWER" (x 1010) + one subline each at y 348–404; "LEED GOLD" badges under both at y 856; judgment line at y 900.
Facts — Amorepacific: David Chipperfield Architects + Arup, completed 2017; a cube organised around a **central courtyard**; **three large "urban openings"** connect the courtyard to the outside; vertical **fins** tuned against solar gain/glare; **~22 storeys**, 7,000–8,000 occupants; LEED Gold (2018, Core & Shell); CIBSE Building Performance Award (measured performance). Lotte World Tower: KPF, completed 2017; **555 m, 123 floors**; tapering form; **720 geothermal probes ~200 m deep**; **Han River water heat exchange**; vertical-axis wind turbines near the top; photovoltaics; greywater reuse, rainwater harvesting; LEED Gold.
- 1 — Amorepacific cube in axo with the courtyard void and the three openings cut through; fine fin lines on the façade; a **blue airflow path** rising through the courtyard and out (the passive strategy is the focal information). Labels: "Central courtyard", "Three urban openings", "Solar fins", "~22 storeys · 7,000–8,000 occupants".
- 2 — Lotte tower massing (smooth taper), with its equipment shown as attached systems: probe field below ground (many thin vertical lines), river-water pipe, turbine mark at the crown, PV band. Equipment in **red** (the point: performance from equipment). Labels: "Vertical-axis wind turbines", "Photovoltaics", "720 geothermal probes, ~200 m deep", "Han River water heat exchange", "555 m · 123 floors".
Each building may be at its own scale (don't imply relative scale; no scale bar).

## 4. `s14-nanjido` — Nanjido: 90 m of garbage → Haneul Park
Region `{x:100, y:300, w:1000, h:660}` · states 0–2 · B2→1, B3→2.
HTML around: headline; timeline column at x ≥ 1120 (1978 / 1993 / 2002 / 2012 / Freshkills).
Facts: Seoul's official dump 1978–1993 · **two mounds ~90 m high** · Korea had **no landfill gas or leachate treatment** at the time · closed 1993, stabilised; transformed 1996–2002 into World Cup Park · the mounds became **Haneul (Sky) Park** and Noeul Park · **landfill gas is now captured and used**.
- 1 — a cut-away axo section of a mound rising layer by layer (compacted waste strata), second mound behind as a quiet silhouette. Label: "Compacted waste, ~90 m".
- 2 — the fix arrives: impermeable cap, soil, a fine planted surface on top, and **red gas-extraction wells** piercing the mound (the focal element). Labels: "Impermeable cap", "Gas extraction wells", "Haneul Park".

## 5. `s07-balcony` — Solar City Seoul: the balcony as power plant
Region `{x:100, y:330, w:760, h:640}` · states 0–2 · B2→1, B3→2.
HTML around: "540,000 apartment balconies targeted", progress bar (357.1 MW by 2019 of 1 GW target), US$1.46 bn, "the barrier Seoul named itself: not enough installable surface area" — all at x ≥ 900.
Facts: 2017 programme; mini-PV kits on **apartment balcony railings** (standardised, subsidised, renter-installable, with published aesthetic/safety standards).
- 1 — a typical Korean apartment slab (≈15 floors, repeated balcony bays) as a white model in axo.
- 2 — mini-PV panels populate the railings in a sweeping wave from the lowest corner upward (panels = focal, **red**). One detail callout at a single balcony showing the railing-mounted kit. Labels: "Mini-PV on balcony railings", "Renter-installable kit".

## 6. `s11-nowon` — Nowon EZ House exploded axonometric
Region `{x:100, y:320, w:900, h:620}` · states 0–2 · B2→1 (explode with labels), B4→2 (collapse to the assembled building).
HTML around: "121 units", MOLIT R&D, "First Korean housing to earn German Passive House certification — Building 102, August 2018", "75–80% energy self-sufficiency", "−61% residents' energy costs" (x ≥ 1030).
Facts: Korea's first zero-energy multi-family complex (Nowon-gu, 2017), 121 units; ~1,300–1,800 PV panels (sources conflict); ~130 ground-source heat pumps; Passive House envelope.
Follow diagram-design `type-exploded.md` (2–5 parts, one label column, horizontal leaders, equal gaps, one focal part). Suggested 5 parts bottom→top: **"Geothermal field"** (sub: "~130 ground-source heat pumps", blue), **"Structure"**, **"Passive House envelope"** (sub: "insulation · airtightness · triple glazing"), **"MVHR heat recovery"**, **"PV array"** (sub: "1,300–1,800 panels", red focal).
- 2 — the parts settle into one ordinary-looking mid-rise block; labels fade. The point: this is normal construction, layered correctly.

## 7. `s13-rfid` — the RFID food-waste bin
Region `{x:100, y:410, w:1240, h:450}` · states 0–3 · B2→1 TAP, B3→2 WEIGH, B4→3 BILL.
HTML around: "9–31%" reduction column (x ≥ 1360); lesson line at y 906.
Facts: residents tap an **RFID household card**; the shared bin opens, a **load cell weighs** the deposit; the household is **billed by weight**; cutting food waste 10–30% vs the same period last year earns up to 5,000 points (≈ ₩5,000).
Model a Korean apartment-complex RFID food-waste unit (boxy bin, card reader, small display). 1 — card meets reader (reader indicator red). 2 — lid opens, bag drops, load cell highlighted, display reads "4.2 kg" (illustrative example value). 3 — a charge line runs to a household (apartment) mark; small "points back" token. Labels: "Tap household card", "Load cell weighs it", "Billed by weight".

## 8. `s16-cheonggye` — Cheonggyecheon before → after
Region `{x:100, y:320, w:940, h:300}` (wide and short — design for it) · states 0–2 · B2→1 BEFORE, B3→2 AFTER.
HTML around: species bars (x ≥ 1130), "−35%" particulates and "3.3–5.9°C" cooler stats (y 636–760), closing line.
Facts: 2003–05; an elevated expressway carrying ~168,000 vehicles/day removed; the culverted stream daylighted; 5.8 km; US$281 m.
One axo street slice that transforms. 1 — double-deck elevated expressway on columns above a road deck that covers the culverted stream. Labels: "Elevated expressway", "Culverted stream". 2 — the expressway lifts away and dissolves, the deck opens, **water (blue)** fills a stepped channel, fine planting and walkways appear. Labels: "Daylighted stream", "Planted banks".

## 9. `s15-export` — where Seoul's trash goes now (uses the map foundation)
Region `{x:850, y:470, w:950, h:380}` · states 0–1 · B4→1.
HTML around: left column of stats (x ≤ 760); headline "Seoul's trash now travels 130 kilometres." (the 130 km figure is the reported road-distance headline from Seoul Economic Daily).
Facts: from 1 Jan 2026 direct landfilling is banned in Seoul/Incheon/Gyeonggi; **Gangdong-gu** ships household waste to private incinerators in **Cheonan** and **Sejong**; **Gangnam-gu** plans to send waste to **Cheongju**.
A zoomed map of the capital region + Chungcheong (KOSTAT provinces, smoothed, light-grey outlines). Seoul outline with Gangdong-gu and Gangnam-gu picked out; red arcs animate one after another from those districts to the three cities. **Compute the distance labels from coordinates (great-circle, rounded to 5 km) — do not reuse the old slide's numbers, which were wrong.** Coordinates: Seoul City Hall 37.5665, 126.9780 · Cheonan 36.8151, 127.1139 · Sejong (Government Complex) 36.4800, 127.2890 · Cheongju 36.6424, 127.4890 (expected ≈ 85 km, ≈ 125 km, ≈ 110 km). Labels: city name + "≈ N km". Optionally a quiet dashed outline labelled "Capital region" so the arcs visibly leave it.

## 10. `s06-reactor` — One Less Nuclear Power Plant
Region `{x:100, y:420, w:1080, h:420}` · states 0–2 · B2→1, B3→2.
HTML around: result panel at x ≥ 1200 ("2.04M TOE", 79% / 21% bar); closing quote at y 872.
Facts: Phase 1 goal **2 million TOE = the annual output of one nuclear reactor**; met June 2014; 1.59 M TOE from efficiency (79%), 410 k TOE renewables (21%); **1.68 million** Eco-Mileage participants.
1 — a Korean nuclear plant as a white model: **containment dome + turbine hall, no cooling tower** (Korean plants are coastal and seawater-cooled — a cooling tower would be inaccurate). Label: "One nuclear reactor — 2 million TOE a year".
2 — the plant dissolves into a large instanced field of tiny dwellings (≈1,500–2,000 instances) that reassembles to the right; 79% of them red (efficiency), 21% muted (renewables). Label: "1.68 million households + retrofits".

## 11. `s09-zeb` — the ZEB ladder
Region `{x:100, y:320, w:860, h:620}` · states 0–2 · B2→1, B3→2.
HTML around: rollout list at x ≥ 990 (2020 public / 2023 / 2024 struck-through delay / 2025 private Grade 5 / 2030).
Facts: ZEB grades a building by **energy self-sufficiency rate**; **Grade 5 = 20–40%**, **Grade 1 = over 100%**. Do **not** label grades 4–2 with percentages (not confirmed).
1 — five building masses stepping up left→right, Grade 5 → Grade 1, with PV coverage increasing on each; Grade 1 red. Labels: "GRADE 5 · 20–40%", "GRADE 4", "GRADE 3", "GRADE 2", "GRADE 1 · over 100%", and one axis caption "Energy self-sufficiency rate".
2 — Grade 5 gets a red outline and a small label "2025 private mandate".

## 12. `s17-parks` — park area per person, at true scale
Region `{x:120, y:330, w:560, h:600}` · states 0–1 · B2→1.
HTML around: programme (536 → 1,036 gardens, Seoullo 7017) at x ≥ 700; rooftops column further right.
Facts: **17.74 m² of park per person citywide (2022)** vs **5.65 m² within a five-minute walk**.
Two square plates at **true area scale** (sides √17.74 = 4.21 m and √5.65 = 2.38 m) with a 1.7 m human scale figure on each — an architect's scale comparison. Citywide plate neutral, five-minute plate red. Labels: "17.74 m² per person — citywide", "5.65 m² — within a 5-minute walk".

## 13. `s05-trajectory` — emissions to 2050
Region `{x:100, y:320, w:840, h:620}` · states 0–1 · B2→1.
HTML around: car phase-out ladder at x ≥ 960; "279,000 EVs by 2033".
Facts: **52.34 Mt CO₂e in 2005** (baseline) · **−50% by 2033** · **net zero 2050**. The path between milestones is drawn linear for illustration only.
A receding 3D bar field, 2005 → 2050 (46 bars), rising in sequence; 2005–2033 red, 2034–2050 muted. Labels: "52.34 Mt · 2005", "−50% · 2033", "Net zero · 2050".

## 14. `s18-buslane` — Seoul's median bus lanes
Region `{x:100, y:330, w:800, h:300}` · states 0–1 · B2→1.
HTML around: "+11 km/h", "−24%" stats and the fare-integration caption below (y ≥ 648); Climate Card column on the right.
Facts: 2004 reform; **median (centre-running) bus lanes** on arterials; colour-coded routes — **Blue = trunk, Green = neighbourhood feeder, Red = express/suburban, Yellow = downtown circulator**.
An axo street section of a Seoul arterial with centre bus lanes and island platforms, a blue trunk bus and a green feeder bus in the median lanes (real Seoul bus colours are the information here), cars as white models in the curb lanes. Labels: "Median bus lanes", "Island platforms", plus a compact four-chip key "Blue trunk · Green feeder · Red express · Yellow circulator".

## 15. `s04-timeline` — two emergencies
Region `{x:100, y:340, w:1720, h:500}` · states 0–3 · B1→1 (axis), B2→2 (1978, 1993), B3→3 (2002, 2011).
HTML around: headline above; closing line at y 886.
Events: **1978** "Nanjido becomes Seoul's official dump" · **1993** "Dump closed; stabilisation begins" · **2002** "Reopens as World Cup Park" (blue) · **2011** "Fukushima + Seoul blackout" (red).
A minimal 3D axis (thin extruded rule in slight perspective/axo) with four restrained markers; years as large labels, events as small labels, alternating above/below so nothing collides. Restraint over illustration.

## 16. `s03-donut` — 67% buildings
Region `{x:110, y:400, w:540, h:500}` · states 0–1 · B1→1.
HTML around: legend to the right (Buildings 67% · Transportation 18% · Waste & other 15%).
A thick extruded ring chart at an axonometric tilt: buildings segment 67% **red** and slightly raised, transportation 18% and waste/other 15% in muted greys. Centre label (inside the ring — allowed) "67%" large + "BUILDINGS" small caps.
