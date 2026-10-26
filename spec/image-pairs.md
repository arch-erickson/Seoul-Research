# Seoul vs New York — Image Interstitial Briefs (i01–i18)

Read `ARCHITECTURE.md` §7 for the file/manifest contract. Each interstitial is a 10-second slide placed right after content slide N: Seoul photo on the left half, New York photo on the right half (each panel 960 × 1080 stage px, cropped around `focal`), caption = place + subject only.

## Rules
- **Accuracy first.** The photo must show exactly the captioned subject. Confirm it two ways: (1) the source page's title / description / categories / coordinates, and (2) look at the image yourself (open the downloaded file) and confirm it matches. If a reviewer would doubt it, reject it.
- **Real photographs only** — no AI-generated, illustrated, or composited images; no stock watermarks; no heavy filters/HDR halos; daylight preferred; level horizons.
- **Licence must allow reuse** in a student presentation: Public Domain / CC0 / CC BY / CC BY-SA preferred; CC BY-NC(-SA) acceptable (non-commercial class use); **no ND** (we crop). US federal works (e.g. NARA / EPA DOCUMERICA) are public domain. Record credit, licence and source page URL for every file.
- **Resolution:** long edge ≥ 1920 px at the cropped panel (≥ 1080 px tall after cropping to the half-slide panel). Download the original and resize to a 2560 px long edge max, sRGB JPEG q≈85. Below 1600 px long edge → `status:"low-res"` plus a `codexUpscalePrompt` (e.g. "Upscale to 2560 px long edge with a photo-faithful model; preserve architectural edges and signage; no hallucinated detail; no sharpening halos.").
- **If you genuinely can't find an accurate, licensable photo**, set `status:"user-supply"` and a `userSupplyNote` of a few words (what to find + why), e.g. "Nowon EZ House exterior — no open-licence photo found; search Naver images / ask SMG press office."
- Sources that work from this machine: **Wikimedia Commons** (set a descriptive User-Agent such as `ARCH3551-StudentPresentation/1.0 (educational slide deck)` — requests without one are blocked; use the API `prop=imageinfo&iiprop=url|size|extmetadata` to get the original URL, licence and author) and **Openverse** (`https://api.openverse.org/v1/images/?q=...`, returns licence metadata). Flickr CC pages are fine if the original size is downloadable. Don't send any personal email/identity in headers.
- Make a contact sheet (`.tmp/img/contact-sheet.html`, both photos side by side per pair with captions and credits) so the MAIN session and the user can review everything at a glance.

## The 18 pairs

| id | after slide | theme | Seoul subject (caption) | New York subject (caption) | notes |
|---|---|---|---|---|---|
| i01 | 1 Title | Two vertical cities | Seoul skyline over the Han River (apartment towers; N Seoul Tower if visible) | Midtown Manhattan skyline | Clear daytime; similar framing/horizon height across both |
| i02 | 2 Same problem | Density | Large Seoul apartment complex, aerial (e.g. Jamsil, Mok-dong, Nowon) | Dense NYC residential, aerial (e.g. Co-op City, Stuyvesant Town, Queens towers) | Show "same density, same building problem" |
| i03 | 3 Already built | The existing stock | Older Seoul apartment blocks at street level (1980s–90s era) | Pre-war / post-war NYC apartment buildings at street level (Bronx, Upper Manhattan, Brooklyn) | These are the retrofit candidates |
| i04 | 4 Two emergencies | Landfills, then | Nanjido landfill while in use (pre-1993) | Fresh Kills landfill while in use (e.g. 1973 EPA DOCUMERICA, public domain) | Historical. If no open Nanjido photo exists → user-supply note |
| i05 | 5 The plan | Driving into downtown | Central Seoul green transport zone / Gwanghwamun–Sejong-daero street | NYC congestion-pricing zone (CBD tolling, launched Jan 2025) signage or gantry | Caption must not overclaim; place + subject only |
| i06 | 6 One less nuclear plant | Energy supply | Rooftop solar on a Seoul public building or apartment complex | Indian Point Energy Center, Buchanan NY (closed 2021) | Discussion hook: Seoul chose not to need a plant; NY lost one |
| i07 | 7 Balcony as power plant | The apartment façade | Seoul apartment balconies with mini-PV panels on the railings (베란다 태양광 / 미니태양광) | NYC apartment façade with fire escapes / balconies, no solar | The NYC surface that generates nothing |
| i08 | 8 Retrofit by loan | Deep retrofit | A Seoul building documented as energy-retrofitted (BRP or similar); if none is verifiable, older Seoul office/apartment stock | Empire State Building | Don't caption a Seoul building as retrofitted unless the source says so |
| i09 | 9 ZEB ladder | The public sector goes first | Seoul City Hall (2012, iArc) | P.S. 62 — The Kathleen Grimm School for Leadership and Sustainability, Staten Island (NYC's first net-zero energy school) | |
| i10 | 10 Energy Dream Center | Teaching buildings | Seoul Energy Dream Center, World Cup Park (exterior) | Queens Botanical Garden Visitor & Administration Center | |
| i11 | 11 Nowon EZ House | Zero-energy housing | Nowon EZ House / Nowon Energy Zero housing complex | Sendero Verde, East Harlem (large Passive House housing) | Nowon photos may be scarce → user-supply note if needed |
| i12 | 12 Two ways to build big | Supertalls | Lotte World Tower | One World Trade Center | Similar vantage (tower + context) |
| i13 | 13 Pay as you throw | The bin | Seoul RFID food-waste bin (음식물 쓰레기 RFID 종량기) at an apartment complex | DSNY brown curbside compost/organics bin | Close-up of the actual hardware |
| i14 | 14 Nanjido | Landfill to park | Haneul Park (World Cup Park, former Nanjido mound) | Freshkills Park, Staten Island | |
| i15 | 15 The 2026 crisis | Where trash goes | Mapo Resource Recovery Facility (incinerator), Seoul | A DSNY Marine Transfer Station or NYC containerised waste-export barge/rail | Talking point: NYC already exports all its trash |
| i16 | 16 Cheonggyecheon | Road removed vs road remaining | Cheonggyecheon stream, restored (daytime) | Cross Bronx Expressway | |
| i17 | 17 Garden city | Viaduct to park | Seoullo 7017 | The High Line | Verified reachable: `File:Seoullo_7017_02.jpg` (5232 px, Commons) |
| i18 | 18 Transit | Bus lanes | Seoul median bus lane with a blue trunk bus | NYC red-painted bus lane with a Select Bus Service bus | |

Deliver `spec/images.json` with all 18 pairs (36 entries), `assets/img/iNN-seoul.jpg` / `iNN-nyc.jpg`, the contact sheet, and `STATUS-IMAGES.md` listing every pair as ok / low-res / user-supply.
