# STATUS — IMAGES session

| Deliverable | State |
|---|---|
| `spec/images.json` (18 pairs / 36 entries, §7 schema) | DONE |
| `assets/img/iNN-seoul.jpg` / `iNN-nyc.jpg` (28 files, lowercase, ≤2560 px, sRGB, q85) | DONE |
| `.tmp/img/contact-sheet.html` (each pair side by side: 8:9 slide crop + full frame, caption, credit, source link) | DONE |

**Totals: 28 ok · 0 low-res · 8 user-supply.** Every `ok` file has a long edge of at least 1920 px and an 8:9 panel crop at least 1080 px tall.

| id | after | Seoul | New York |
|---|---|---|---|
| i01 | 1 | OK · Han River and N Seoul Tower | OK · Midtown Manhattan skyline |
| i02 | 2 | OK · Jamsil apartment towers | OK · Stuyvesant Town |
| i03 | 3 | OK · Hyundai Apartments, Apgujeong | OK · Apartments on the Grand Concourse |
| i04 | 4 | OK · Nanjido in 1983 (Seoul Museum of History, KOGL Type 1) | OK · Fresh Kills landfill in 1973 (NARA, public domain) |
| i05 | 5 | OK · Sejong-daero | OK · Congestion Relief Zone sign |
| i06 | 6 | USER-SUPPLY · Rooftop solar panels | OK · Indian Point nuclear plant |
| i07 | 7 | USER-SUPPLY · Balcony solar panels | OK · Fire escapes, the Bronx |
| i08 | 8 | OK · Sewoon Sangga, an older block (no retrofit claim) | OK · Empire State Building |
| i09 | 9 | OK · Seoul City Hall | USER-SUPPLY · P.S. 62, net zero school |
| i10 | 10 | USER-SUPPLY · Seoul Energy Dream Center | OK · Queens Botanical Garden visitor center |
| i11 | 11 | USER-SUPPLY · Nowon EZ House | USER-SUPPLY · Sendero Verde, East Harlem |
| i12 | 12 | OK · Lotte World Tower | OK · One World Trade Center |
| i13 | 13 | USER-SUPPLY · RFID food waste bin | OK · DSNY brown compost bin |
| i14 | 14 | OK · Haneul Park | OK · Freshkills Park |
| i15 | 15 | USER-SUPPLY · Mapo incinerator | OK · Marine transfer station, Harlem |
| i16 | 16 | OK · Cheonggyecheon stream | OK · Cross Bronx Expressway |
| i17 | 17 | OK · Seoullo 7017 | OK · The High Line |
| i18 | 18 | OK · Median bus lane, Yeongdeungpo | OK · Select Bus Service lane |

## Notes for MAIN
- `user-supply` entries keep `file: assets/img/iNN-<side>.jpg` but **no file exists**. Render the panel blank or leave it out until the user drops a photo there. Each has a plain `userSupplyNote` (what to find + where).
- Extra fields beyond §7: `author`, `licenseUrl` (for the appendix credits). `credit` is ready to print.
- Focal → CSS for an 8:9 `object-fit: cover` panel: landscape (w/h > 8:9): `f = (8/9)/(w/h)`, `cx = clamp(fx, f/2, 1-f/2)`, `object-position-x = (cx - f/2)/(1 - f) * 100%` (y = 50%); portrait: same with `f = (w/h)/(8/9)` on y.
- Captions follow the user's rule: plain words, no em/en dashes.
- i13 Seoul fallback: an RFID food-waste unit photographed in Hoengseong (not Seoul) is at `.tmp/img/dl/i13/Hoengseong_apt_food_waste_bin.jpg`. Usable only if the caption says KOREA, not SEOUL.
- i18 Seoul shows the median bus lane and stop at Yeongdeungpo Station with green branch buses (no open-licence median-lane photo with a blue trunk bus was usable).

## How it was made
Commons/Openverse search via `.tmp/img/tools/imgtool.py` (shared polite rate limiter). 12 pairs were researched by parallel agents and the rest by hand. The agents' adversarial review step was cut off by the usage limit, so every pick was then checked by eye (full frame and 8:9 crop) and against its source page (title, description, categories, coordinates, licence). Rebuild: `py -I .tmp/img/tools/build_picks.py && py -I .tmp/img/tools/process.py`.
