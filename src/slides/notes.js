// Speaker notes for the presenter view — owned by the MAIN session.
//
// NOTES[key] is markdown, keyed by the spec/timing.json key (s01-s20, i01-i18, refs).
// Every timed slide starts with a header line, then one cue line per beat:
//
//   **m:ss · N beats · ends m:ss**        duration · beat count · cumulative end time (incl. the 10 s image slides; deck = 38:30)
//   *optional one-line remark*
//   **[m:ss] Bn — label**                  cue time from slide entry, beat id, label (one per timing.json beat, in order)
//   - bullet
//
// Markdown subset used: **bold**, *italic*, "- " bullets, "1. " numbered lines, "> " never.
// Tildes are plain "~" (approximately) — never strikethrough. A backslash escapes the next
// character (only notesFor() emits escapes, for credit text coming from spec/images.json).
//
// Numbers come only from 01-Seoul-Research-Dossier.md. The s15 map distances are great-circle
// distances from Seoul City Hall computed from coordinates (rounded to 5 km), not dossier figures.
//
// notesFor(key, images) returns NOTES[key] plus, for image slides, the photo credits / status flags
// from spec/images.json, and for the appendix the full list of image credits.

export const NOTES = {
  s01: `**0:45 · 1 beat · ends 0:45**
*Clicker: going back a slide pauses the timer. The first → only resumes it; the next → moves on.*

**[0:00] B1 — title + map**
- **Open with a question, not a fact:** "How many of you composted last night?" — pause, let the hands stay down.
- "In Seoul, you would have. Not because you're better people — because **the bin weighs your trash and bills you for it**."
- Set the frame: not a travel brochure. One of Seoul's flagship policies is **failing right now, in 2026** — and that failure is the most useful thing in this talk.
- Promise the payoff: "By the end you'll leave with **five specific things New York should steal**."`,

  i01: `**0:10 · 2 beats · ends 0:55**

**[0:00] B1 — Seoul**
- Apartment towers over the Han — **~9.4M people** in the city, ~26M in the metro.

**[0:04] B2 — New York**
- Midtown — **~8.3M** in the city, ~20M in the metro. **Two vertical cities.**
- *Into the next slide:* "Same problem. Opposite philosophy."`,

  s02: `**1:30 · 4 beats · ends 2:25**

**[0:00] B1 — headline**
- "Two cities with the same problem — that chose **opposite philosophies** to solve it."

**[0:20] B2 — population + metro**
- Seoul **~9.4M city / ~26M metro** · NYC **~8.3M city / ~20M metro**
- Both very dense and vertical — Seoul **apartment-dominant**, NYC a mixed stock — and **neither has land left** for new green space

**[0:45] B3 — buildings' share of emissions**
- **Buildings = 67% of Seoul's GHG · 66–71% of NYC's** (the range is because NYC inventories differ by year)
- Each city has one flagship climate law: Seoul's **Basic Plan for Carbon Neutrality**; NYC's **Local Law 97**

**[1:05] B4 — the climate policy**
- **The divergence — this is the whole talk: Seoul lends at 1.75%. NYC fines at $268 per ton.**
- "Hold that difference in your head for the next half hour. Everything else is a consequence of it."`,

  i02: `**0:10 · 2 beats · ends 2:35**

**[0:00] B1 — Seoul**
- A Seoul apartment complex from above — **the building is the unit of the problem**.

**[0:04] B2 — New York**
- New York's dense residential blocks: **same density, same building problem**.
- *Into the next slide:* "So why buildings? Look at the split."`,

  s03: `**1:00 · 2 beats · ends 3:35**
*Short slide — move briskly.*

**[0:00] B1 — the split**
- **Buildings 67%**; buildings + transport together **85%**
- **Say the caveat out loud — it builds credibility:** Seoul's own 2020 release said 68.2%; a UNESCAP paper said 68.8% on 2018 data. **"Roughly two-thirds" is what's defensible.** I'll flag disagreeing sources throughout — they disagree often.
- 67% from buildings means **the design professions own this problem** — not utilities, not transit agencies. Us.

**[0:35] B2 — baseline + map**
- Seoul's 2005 baseline: **52.34 million tons CO₂e** — the figure the −50% target is measured from
- Point at the map: a tiny red patch carrying a huge share of the country's people — read the caption as written
- "And almost all of those buildings are **already standing**. We don't get to design our way out with new work."`,

  i03: `**0:10 · 2 beats · ends 3:45**

**[0:00] B1 — Seoul**
- Older Seoul apartment blocks at street level — **these are the retrofit candidates**.

**[0:04] B2 — New York**
- New York's pre-war and post-war apartment stock — **the same job, already built**.
- *Into the next slide:* "So why did Seoul act at all? Two emergencies."`,

  s04: `**1:15 · 3 beats · ends 5:00**

**[0:00] B1 — headline**
- "Seoul's climate policy has two origin stories. **Neither one is idealism.**"

**[0:15] B2 — 1978 · 1993: the first emergency**
- **1977:** an embankment joins Nanjido island to the mainland. **1978:** it becomes Seoul's official dump — chosen for access and distance from downtown
- Waste piled to **~90 m** in two mounds. **Korea had no landfill gas or leachate treatment at the time** — it vented methane and toxic gas into the city
- **1993:** the city closes it and begins stabilisation

**[0:45] B3 — 2002 · 2011: the second emergency + the line**
- **2002:** the dump reopens as **World Cup Park** — hold that, it comes back with Nanjido
- **2011: Fukushima, plus a Seoul blackout** the same year
- **Korea's energy self-sufficiency is 22.1% — 35th of 38 OECD countries.** It imports almost all its energy
- Land the line slowly: **"A garbage mountain and a power failure — not a manifesto."**
- Worth remembering when we ask what actually motivates cities to act`,

  i04: `**0:10 · 2 beats · ends 5:10**

**[0:00] B1 — Seoul**
- Nanjido in use: **~90 m of waste, no gas or leachate treatment**.

**[0:04] B2 — New York**
- Fresh Kills in use — **once the world's largest landfill**. Same problem, same era.
- *Into the next slide:* "Out of that came a plan with real dates in it."`,

  s05: `**1:30 · 4 beats · ends 6:40**

**[0:00] B1 — headline**
- Governing document: **Basic Plan for Carbon Neutrality and Green Growth in Seoul**, a 10-year plan
- *If asked about Korea nationally: net zero 2050; NDC −40% vs 2018 by 2030*

**[0:20] B2 — trajectory**
- **−50% by 2033** from the 2005 baseline of **52.34 Mt**; **net zero 2050**
- New public buildings: ZEB Grade 5 now → **Grade 4 by 2030** → **Grade 3 by 2050**
- *Caveat if asked: the path between milestones is drawn linear — the plan sets endpoints, not the shape*

**[0:50] B3 — ban ladder**
- Already in force: Grade 5 diesel banned citywide December–March, year-round in the centre
- Walk the four rungs out loud, one per 5 seconds: **2025 · 2030 · 2035 · 2050**
- **"Seoul has set a date — 2035 — when driving a gasoline car into downtown becomes illegal."**

**[1:15] B4 — EV target**
- **279,000 EVs by 2033**
- *Into the photos:* "Here's what downtown driving policy looks like in each city."`,

  i05: `**0:10 · 2 beats · ends 6:50**

**[0:00] B1 — Seoul**
- Central Seoul — the **green transport zone** where Grade 4 diesel is banned from 2025.

**[0:04] B2 — New York**
- Manhattan's congestion-pricing zone: **New York charges a toll to enter; Seoul bans the engine by date.**
- *Into the next slide:* "So how does Seoul hit dates like these? It started with energy."`,

  s06: `**2:00 · 5 beats · ends 8:50**

**[0:00] B1 — headline**
- **One Less Nuclear Power Plant**, launched 2012 — a direct response to **Fukushima and the Seoul blackout, both 2011**

**[0:20] B2 — reactor**
- **Phase 1 goal: 2 million TOE** — the annual output of one nuclear reactor
- The conceptual move: Seoul set out to **not need** a plant rather than build a cleaner one

**[0:45] B3 — the plant becomes households**
- Watch the plant dissolve: replaced by **1.68 million households** plus efficiency retrofits
- **Eco-Mileage** was the most effective single measure — **190,000 TOE** saved
- The design insight: it made invisible consumption **visible and comparative**, then attached a reward. Behavioural design, not engineering

**[1:15] B4 — result panel**
- **Met June 2014, six months early — 2.04 million TOE**
- Split: **1.59M TOE efficiency / 410k TOE renewables** — about four-fifths came from using less
- Phase 2: **~4.65 MTOE** (2012–17); electricity self-sufficiency roughly doubled, **under 3% → around 5%** *(C40 says 5%, SMG says 5.5%)*
- Legacy: **Seoul Energy Corporation**

**[1:40] B5 — closing line**
- Deliver the quote slowly. Then pause.
- *Into the photos:* "Seoul decided not to need a plant. Look at what New York did with one."`,

  i06: `**0:10 · 2 beats · ends 9:00**

**[0:00] B1 — Seoul**
- Rooftop solar on a Seoul building — **supply added roof by roof**.

**[0:04] B2 — New York**
- Indian Point, now closed: **Seoul chose not to need a plant; New York lost one.**
- *Into the next slide:* "Demand was the easy half. Supply is where Seoul hit a wall."`,

  s07: `**1:30 · 4 beats · ends 10:30**

**[0:00] B1 — headline**
- **Solar City Seoul**, launched 2017. Target **+1 GW by 2022**, PV to **1 million households**

**[0:18] B2 — the slab**
- Point at the model: a typical Seoul apartment slab — **every bay has a balcony railing**
- The programme: standardised kits, public subsidy, published aesthetic and safety standards, **renter-installable**
- "Every one of us has designed a balcony. None of us has designed one that generates electricity."

**[0:45] B3 — panels + scale**
- The red panels filling the railings are the **mini-PV kits**
- **540,000 balconies**, plus 90,000 rental homes and 370,000 buildings
- **357.1 MW across 285,000 households by 2019** — ahead of the interim milestone at the time
- Seoul was the **first Korean municipality** to subsidise small solar (≤50 kW), paid per kWh for five years

**[1:10] B4 — cost + barrier**
- **US$1.46 bn** (₩1.7 trillion), largely public
- **Say the limitation out loud:** Seoul itself named **insufficient installable surface area** as the barrier. A dense vertical city runs out of roof fast
- *Into the photos:* "Here's the surface I mean — in both cities."`,

  i07: `**0:10 · 2 beats · ends 10:40**

**[0:00] B1 — Seoul**
- Point at the panels **on the railings** — the balcony as generator.

**[0:04] B2 — New York**
- New York's fire escapes and balconies: **the same surface, generating nothing**.
- *Into the next slide:* "Which forces you back to the buildings that already exist."`,

  s08: `**2:00 · 4 beats · ends 12:40**

**[0:00] B1 — headline**
- **Building Retrofit Project (BRP)** launched **2008**, expanded 2012 under One Less Nuclear Power Plant

**[0:20] B2 — Seoul panel**
- Extended to private universities and hospitals, then to residential
- 2013: rate cut **2.5% → 1.75%**; max loan raised **80% → 100%** of eligible cost
- "You can retrofit your building for **no money down at under two percent**."
- Results — **give the range, the sources disagree:** 25,841 tCO₂ across ~4,200 projects (C40) · 72,000 buildings (other C40) · 20,000 buildings and 192,234 TOE (SMG)
- Measured sample: **−10% residential, −6.5% non-residential**; 59 welfare facilities ~15%

**[0:50] B3 — NYC panel**
- LL97 (2019): buildings **>25,000 sq ft**, **−40% by 2030, −80% by 2050**, **$268 per ton** over the cap
- Caps tighten hard: **office −64.5%, multifamily −50.4%** between the 2024–29 and 2030–34 periods
- **~11%** of buildings exceed current caps — but **~63%** are projected to miss their **2030** caps

**[1:30] B4 — the verdict**
- LL97 sets the target and the penalty and **leaves the capital stack entirely to owners**
- **Flag it forward:** "This becomes recommendation number two at the end."
- Context: buildings are **56% of Seoul's total energy consumption**
- **Pause at ~1:45** — let the comparison sit before the photos`,

  i08: `**0:10 · 2 beats · ends 12:50**

**[0:00] B1 — Seoul**
- Ordinary Seoul stock — **what BRP lends to**. Check the caption: only say "retrofitted" if it says so.

**[0:04] B2 — New York**
- The Empire State Building — New York's most famous retrofit. **LL97's real problem is the ordinary buildings behind it.**
- *Into the next slide:* "Loans fix what's standing. For new buildings, Korea grades them."`,

  s09: `**1:15 · 3 beats · ends 14:05**

**[0:00] B1 — headline**
- ZEB grades a building by **energy self-sufficiency** — the share of its energy it produces itself

**[0:20] B2 — the ladder**
- **Grade 5 = 20–40%** self-sufficient. **Grade 1 = over 100%**, net positive
- *Grades 4–2 are unlabelled deliberately — the intermediate bands weren't confirmable in my sources*

**[0:45] B3 — rollout + the delay**
- **2020** new public buildings (over 1,000 m², later 500 m²) → **2023** public at Grade 5 → **2025** private at Grade 5 (complexes ≥30 units, buildings over 1,000 m²)
- **Point at the struck-through 2024.** The private mandate slipped a full year after construction-industry pushback
- MOLIT's own framing: *"improving the energy performance of private buildings, which account for the majority of buildings, is an essential task"*
- **The lesson:** Seoul mandated the public sector first and used its own buildings as the proving ground — that sequencing made the private mandate survivable, and it still slipped
- *2030 "all new buildings ZEB" is reported but less certain — say so if asked*`,

  i09: `**0:10 · 2 beats · ends 14:15**

**[0:00] B1 — Seoul**
- Seoul City Hall (2012, iArc): **~28.3% renewables**, a **1,516 m²** green wall — the city put its policy on its own building.

**[0:04] B2 — New York**
- P.S. 62 on Staten Island — **New York's first net-zero energy school**. Both cities let the public sector go first.
- *Into the next slide:* "So what does a Grade 1 building actually look like? Seoul built one on a garbage dump."`,

  s10: `**2:45 · 6 beats · ends 17:00**
*Your longest building slide — slow down.*

**[0:00] B1 — headline**
- **Seoul Energy Dream Center**, 2012. World Cup Park, Mapo-gu — **standing on the former Nanjido landfill**
- Design led by **Fraunhofer ISE**, German–Korean team, commissioned by SMG
- *If asked: some sources credit Gerkan Marg & Partners. I couldn't verify it. Fraunhofer ISE is the sourced lead*

**[0:25] B2 — the ground**
- Point at the cut block of strata. **That is compacted municipal waste.**

**[0:50] B3 — piles + base**
- **The subsoil cannot bear load**, so the building sits on piles driven through the waste onto a reinforced-concrete base plate
- **The foundation is a direct architectural expression of what's underneath it**

**[1:15] B4 — the massing**
- Watch the floors rotate: square plan, three storeys widening **conically upward at a 45° rotation** — pinwheel-like, shaped to cut energy demand

**[1:45] B5 — wings + PV**
- **Dwell here.** The wedge-shaped roof projections do three jobs at once: shelter the entrance, act as **fixed solar shading**, and **carry the PV** (in red)
- "This is the clearest example in the deck of **sustainability and form being the same decision**."
- Envelope to **Passive House** standard; the white marble façade reflects sunlight

**[2:20] B6 — geothermal + performance data**
- The blue loops: **geothermal** heating and cooling
- **~280,000 kWh/yr**, fully supplied by its own grid-tied PV; a **~3,500 m²** exhibition and education centre
- **KGBC + Building Energy Efficiency Label**; reported **over 70%** energy savings
- *Closing line:* "Remediated ground, passive form, renewable supply, and a public programme that teaches the thing it demonstrates."`,

  i10: `**0:10 · 2 beats · ends 17:10**

**[0:00] B1 — Seoul**
- The Energy Dream Center for real — **point at the wings**: the shading and the PV you just watched go up.

**[0:04] B2 — New York**
- Queens Botanical Garden's visitor centre — **New York's teaching building**. Both are public buildings that demonstrate what they teach.
- *Into the next slide:* "A pavilion is one thing. Seoul also did it with housing."`,

  s11: `**2:15 · 5 beats · ends 19:25**

**[0:00] B1 — headline**
- **Nowon EZ House**, 2017, Nowon-gu. **Korea's first zero-energy multi-family housing complex**

**[0:25] B2 — exploded assembly**
- Walk up the stack, ground loops to roof. **Say the point out loud:** layered, buildable, **ordinary construction** — not exotic technology
- **~1,300–1,800 PV panels** and **~130 geothermal heat pumps** *(panel counts conflict between sources — give the range)*

**[0:55] B3 — scale + certification**
- **121 units**, targeting annual net-zero primary energy
- Delivered under a **MOLIT national R&D programme** with Seoul and Nowon-gu. **The innovation is procurement as much as design**
- **August 2018: Building 102 became the first Korean housing project to earn German Passive House certification**

**[1:30] B4 — performance**
- The parts settle into one ordinary-looking block
- **~75–80% energy self-sufficiency**; residents' energy costs **up to 61% lower**
- *If asked: "net zero" is the design target; the reported performance is the 75–80%*
- *Do not cite a construction cost — published figures range from US$4.5M to US$49M. If asked, that inconsistency is the honest answer*
- President Moon visited in December 2017 and used it to launch a national expansion push — **one demo became policy**

**[1:55] B5 — the NYC question**
- **"Ask yourself what the NYCHA version of this looks like."**
- That's a financing and procurement question at least as much as a design one`,

  i11: `**0:10 · 2 beats · ends 19:35**

**[0:00] B1 — Seoul**
- Nowon EZ House — **121 units, a zero-energy target**. It looks like ordinary housing; that's the point.

**[0:04] B2 — New York**
- Sendero Verde, East Harlem — **New York's large Passive House housing**. The question is whether it becomes policy, the way Nowon did.
- *Into the next slide:* "Now compare that to how we usually talk about green buildings."`,

  s12: `**2:00 · 5 beats · ends 21:35**
*This is where you show critical judgment.*

**[0:00] B1 — headline**
- Both completed 2017. **Both LEED Gold.**

**[0:20] B2 — Amorepacific HQ (title + drawing arrive together)**
- **Chipperfield with Arup.** 2010 competition, built 2014–17. Amorepacific has held the site since 1956
- **The sustainability strategy IS the form:** a cube around a **central courtyard**, proportioned for natural ventilation and daylight — follow the blue airflow
- Three **"urban openings" / hanging gardens** push light and air deep into the floor plate; façade fins cut solar radiation and glare
- **The detail that matters: it won a CIBSE Building Performance Award — CIBSE judges measured performance, not design intent**

**[0:55] B3 — Lotte World Tower (title + drawing arrive together)**
- **KPF. 555 m, 123 floors.** Reported as the first building over 100 floors to reach LEED Gold
- The red is equipment: **720 geothermal probes** at ~200 m, **Han River water** heat exchange, vertical-axis turbines near the top, PV
- Plus energy recovery wheels, greywater reuse, rainwater harvesting
- *Hedge if challenged: façade-integrated PV and the turbine type are each single-sourced*

**[1:30] B4 — the same badge**
- Point at both badges. **Same certification. Say nothing for a beat.**

**[1:45] B5 — the judgment**
- **"LEED Gold on a 555-metre tower certifies relative efficiency. It does not mean low absolute impact."** Embodied carbon and per-occupant energy of a supertall are enormous regardless`,

  i12: `**0:10 · 2 beats · ends 21:45**

**[0:00] B1 — Seoul**
- Lotte World Tower — **555 m, LEED Gold, performance bolted on as equipment**.

**[0:04] B2 — New York**
- One World Trade Center — **New York's supertall**. Same question: what does the badge actually measure?
- *Into the next slide:* "From the tallest thing in Seoul to the smallest: the bin."`,

  s13: `**1:45 · 6 beats · ends 23:30**

**[0:00] B1 — headline**
- **Volume-based fees since 1995.** You buy official priced bags for non-recyclables — ~₩490 a bag, fines up to ₩100,000

**[0:20] B2 — TAP**
- Food waste is charged **by weight** at a shared smart bin. Step one: the resident taps an **RFID household card**

**[0:32] B3 — WEIGH**
- The lid opens and a **load cell weighs the deposit**
- *The 4.2 kg on the display is an illustrative example, not data*

**[0:44] B4 — BILL**
- That household is **billed by weight**
- **The reward layer:** cut 10–30% versus the same period last year, earn up to **5,000 points** (~₩5,000)

**[1:00] B5 — the results**
- **9–31% food waste reduction** under RFID
- Bag fees overall: **−8% year one, −11% by 1996**
- *Say the caveat:* Seoul Solution itself warns the 1995 figure may be overstated because large items were discarded free that year. **1996 is the more reliable number**
- Separated food waste becomes **animal feed, compost and biogas**

**[1:30] B6 — the real lesson**
- **"The fee is not the clever part. The feedback loop is."**
- **"NYC's bin tells you nothing."** That's the gap, and it becomes recommendation #1`,

  i13: `**0:10 · 2 beats · ends 23:40**

**[0:00] B1 — Seoul**
- The RFID bin — **point at the card reader and the display**. That's the feedback loop.

**[0:04] B2 — New York**
- DSNY's brown bin: **same food scraps, no feedback, no reward**.
- *Into the next slide:* "Seoul learned this the hard way — from the mountain it made first."`,

  s14: `**1:30 · 4 beats · ends 25:10**

**[0:00] B1 — headline**
- Back to the first emergency. **1978:** Nanjido designated Seoul's official dump — chosen for access and distance from downtown

**[0:25] B2 — the mound**
- Waste piled into **two mounds, ~90 m high**
- **Korea had no modern landfill gas or leachate treatment** — it vented methane and toxic gases into a city of millions

**[0:45] B3 — the cap + gas wells**
- The fix: an impermeable cap, soil, planting on top
- Point at the **red wells**: landfill gas is now **captured and used**. The mounds became **Haneul (Sky) Park** and Noeul Park

**[1:05] B4 — timeline + Freshkills**
- Closed **1993**; planning 1991–96; transformation 1996–2002, opening for the **2002 World Cup**
- **2012: the Energy Dream Center you just saw was built on this same ground** — within twenty years of closing the dump
- **Say the NYC parallel generously:** Freshkills — once the world's largest landfill, now **2,200 acres** opening in phases. Same answer, same problem, roughly the same timeline. **Parity, not a lecture**`,

  i14: `**0:10 · 2 beats · ends 25:20**

**[0:00] B1 — Seoul**
- Haneul Park today — **the garbage mountain, capped and planted**.

**[0:04] B2 — New York**
- Freshkills Park, Staten Island — **the same answer to the same problem**.
- *Into the next slide — change your tone:* "That's the success story. Here's what Seoul got wrong — this year."`,

  s15: `**3:00 · 6 beats · ends 28:20**
*THE PIVOT OF THE TALK — slow right down.*

**[0:00] B1 — headline**
- Change your tone. Everything before this was the success story
- **130 km is the reported road distance** some of Seoul's trash now travels (Seoul Economic Daily, Oct 2026)

**[0:25] B2 — the ban**
- **1 January 2026 — this year.** Seoul, Incheon and Gyeonggi stopped direct landfilling of household waste. On schedule, no emergency delay
- **Legislated in 2021 with a five-year grace period** — and capital-region governments largely did not expand incineration capacity during it

**[0:55] B3 — the capacity gap**
- Privately handled household waste hit **457 t/day** in H1 2026 — a **3.2× rise**
- Public incineration rose only **80 tons** (1,921 → 2,001). **The waste didn't get processed — it got exported**
- Seoul runs only **four incinerators** — Gangnam, Mapo, Nowon, Yangcheon — most **20–30+ years old**

**[1:30] B4 — the export map**
- Gangdong ships to private incinerators in **Cheonan** and **Sejong**; Gangnam plans to send waste to **Cheongju**
- **The map labels are straight-line distances** from Seoul City Hall, computed from coordinates: **Cheonan ~85 km, Cheongju ~110 km, Sejong ~125 km**. The **130 km** headline is the reported road distance — trucks drive roads
- *Don't use the old draft's 115 km / 130 km city labels — they were wrong*
- **This is an environmental-justice failure produced by a climate policy**

**[2:05] B5 — the pushback**
- Receiving regions are refusing: **Cheongju's operators agreed not to bid** on capital-region contracts through the end of next year
- Amendments to the **Wastes Control Act** are pending, timing unclear. Seongnam is building a **500 t/day** replacement incinerator

**[2:30] B6 — the question**
- **"A ban without infrastructure is not a policy. It is a deadline."**
- Turn it on the room: **"LL97 fines buildings that can't comply, and ~63% are projected to miss 2030. Does New York have the retrofit workforce, the heat-pump supply chain and the capital to absorb that — or are we repeating Seoul's sequencing error in a different sector?"**
- **Stop talking. Actually wait for an answer.** This is where you lead the discussion`,

  i15: `**0:10 · 2 beats · ends 28:30**

**[0:00] B1 — Seoul**
- Mapo — **one of Seoul's only four incinerators**, and it can't absorb the ban.

**[0:04] B2 — New York**
- New York closed Fresh Kills and **has shipped its trash out of the city ever since**. Seoul's 2026 problem is New York's normal.
- *Into the next slide — lift the tone:* "Now the project Seoul got spectacularly right."`,

  s16: `**2:00 · 6 beats · ends 30:30**

**[0:00] B1 — headline**
- **Cheonggyecheon**, 2003–05. Seoul demolished an elevated expressway carrying **~168,000 vehicles/day** and daylighted the stream beneath it. **US$281 m, 5.8 km**

**[0:20] B2 — BEFORE**
- Point at the section: a double-deck elevated expressway, the stream **culverted underneath the road**

**[0:35] B3 — AFTER**
- Same corridor: the expressway lifts away, **open water**, planted banks, a walkable edge

**[0:50] B4 — biodiversity**
- Species, 2003 → 2008: plants **62 → 308**, insects **15 → 192**, birds **6 → 36**, fish **4 → 25**
- *Say it:* the famous **"639% increase" is an aggregate index, not a species count.** These per-group numbers are the honest version

**[1:15] B5 — cooling and air**
- Small-particle pollution **74 → 48 µg/m³**, about **−35%**
- Cooling **3.3–5.9 °C** vs a parallel road 4–7 blocks away — *give the range: WWF says 3–4 °C vs areas 400 m away; the peer-reviewed review is more conservative, a ~300 m buffer*
- Corridor bus ridership **+15.1%** (2003–08) — *the 2004 bus reform happened at the same time, so causation is shared. Say so; don't overclaim*

**[1:40] B6 — induced demand**
- **The finding that matters: the gridlock everyone predicted never arrived.** Textbook reduced demand
- That is exactly the evidence New York's BQE, Cross Bronx and Gowanus debates are missing`,

  i16: `**0:10 · 2 beats · ends 30:40**

**[0:00] B1 — Seoul**
- Cheonggyecheon today — **where 168,000 vehicles a day used to be**.

**[0:04] B2 — New York**
- The Cross Bronx Expressway — **still there, and on the candidate list**.
- *Into the next slide:* "Seoul kept going — from one stream to a citywide standard."`,

  s17: `**1:30 · 5 beats · ends 32:10**

**[0:00] B1 — headline**
- **Garden City Seoul**, announced 2023. Goal: **a garden within a five-minute walk of home**

**[0:18] B2 — the equity gap**
- Two plates at true scale, a person on each: **17.74 m² per person citywide. 5.65 m² within a five-minute walk**
- "Seoul looks well-provisioned on the citywide average and badly provisioned on the metric that describes an actual person's actual walk. **Same city, measured two ways.**"

**[0:45] B3 — the programme**
- **536 gardens in 2024, target 1,036 by end of 2025**
- Seoullo 7017 — **the distinction worth drawing:** the High Line reused a *rail* viaduct, the easy case. Seoul converted a *car* viaduct

**[1:05] B4 — rooftops**
- Up to **70% of construction cost** subsidised; **12–15%** average heating/cooling saving
- 2026 cool-roof pilot: **31,204 m²** of reflective paint across **152 sites**, aimed at vulnerable households
- Scale is honestly modest — don't oversell it

**[1:20] B5 — the lesson**
- **The transferable idea is the metric, not the gardens.**`,

  i17: `**0:10 · 2 beats · ends 32:20**

**[0:00] B1 — Seoul**
- Seoullo 7017 — a **1970 car overpass**, reopened as a ~1 km skypark in 2017.

**[0:04] B2 — New York**
- The High Line — **a rail viaduct: no driver lost anything**. Seoul took road capacity.
- *Into the next slide:* "Last piece of the city: how people move."`,

  s18: `**1:45 · 4 beats · ends 34:05**

**[0:00] B1 — headline**
- Let it land: one monthly price, every mode. The explanation comes after the buses

**[0:15] B2 — the bus reform**
- **July 2004**, rebuilt in a single overnight switchover. Distance-based fare with **free transfers across modes** — buses and subway unified for the first time
- Point at the **median bus lanes** and the colour key — blue trunk, green feeder, red express, yellow circulator: **a graphic-design decision doing policy work**
- Bus speed up to **+11 km/h**; main-road speed **+33–50%**. **Accidents −24%** in year one — called the reform's most dramatic success
- *Ridership: +9% to +21% depending on baseline — don't add the figures together*
- **UN-Habitat's honest caveat:** service quality rose, but "they failed to curtail subsidy needs in the first few years." **Good transit costs public money, permanently**

**[0:55] B3 — the Climate Card**
- **₩65,000/month**, bundling metro, buses **and Ttareungi bike share** (₩62,000 without bikes)
- Piloted January 2024; **10 million reloads by April 2025**
- Break-even ~4 rides/day at the ₩1,550 subway fare, so **the marginal trip is free**

**[1:30] B4 — the naming lesson**
- **The move to notice is the naming.** NYC has the same mechanism in OMNY fare capping — and sells Citi Bike separately
- *If asked:* SMG publishes reloads but no modal-shift data — we don't actually know how much driving it displaced`,

  i18: `**0:10 · 2 beats · ends 34:15**

**[0:00] B1 — Seoul**
- A blue trunk bus in a **median lane** — the colour system you just saw, on the street.

**[0:04] B2 — New York**
- A Select Bus Service bus in a **red-painted lane**. Same tool; Seoul made it one network with one fare.
- *Into the next slide:* "So — what should New York take?"`,

  s19: `**3:15 · 6 beats · ends 37:30**
*This is the slide the assignment is really grading.*

**[0:00] B1 — headline**
- "Five specific things. I promised these at the start."

**[0:15] B2 — transfer 01, food waste**
- NYC organics were **2.4% of residential waste in 2025**, up from 1.4%. Total diversion **~17%** against DSNY's own **75%** estimate
- Fines scheduled April 2025, **paused within three weeks**, resumed 1 January 2026
- **The IBO's key finding: collection nearly tripled under enforcement, then fell ~43% when fines stopped**
- The gap: NYC has the mandate and the fine but **no feedback loop and no reward** — metered organics bins belong in the building code

**[0:50] B3 — transfer 02, retrofit lending — EMPHASISE THIS ONE**
- **This is the single most important recommendation in the presentation**
- A municipal lending facility at BRP terms — **100% of cost at 1.75%** — tied to LL97 compliance, turns a fine into a financeable project
- NYC has the stick and no carrot. Seoul has the carrot and a weak stick. **Neither half works alone**

**[1:25] B4 — transfer 03, balcony PV**
- Barriers are **code, permitting and landlord consent** — not technical
- Three asks: an approved-kit list, a DOB pathway with no filed alteration, a **renter's right-to-install**

**[1:55] B5 — transfer 04, fare branding**
- Two asks: **bundle Citi Bike into OMNY**, and **brand it as climate policy**
- "Behaviour change needs an identity, not just a discount."

**[2:25] B6 — transfer 05, road removal**
- Live candidates: **BQE cantilever, Cross Bronx cap, Gowanus**
- "Seoul answered the 'where will the traffic go' question twenty years ago, with a built project."
- From ~2:55: stop adding — **hold all five on screen** while you move to the close`,

  s20: `**1:00 · 2 beats · ends 38:30**
*Deck ends at 38:30 — 1:30 left in a 40-minute slot. The discussion is the assignment; keep it going.*

**[0:00] B1 — the question**
- Ask it, then let it hang for a second.

**[0:15] B2 — the three findings**
- Deliver the three sentences cleanly, then the closing line:
- **"Mandates set the date. Money decides whether anyone can meet it. Seoul and New York each built one half — and neither half works alone."**

**Then open the floor. Prompts to have ready:**
1. Carrot vs stick — which would you rather design under, and which actually decarbonises faster?
2. Is NYC repeating Seoul's sequencing error with LL97?
3. Lotte is LEED Gold at 123 floors; Nowon targets net zero at 121 units. Which is doing more, and what does that say about what we certify?
4. NYC composting tripled under fines and fell 43% when they stopped. How do you add Seoul's reward layer without making enforcement regressive?
5. Total green space, or green space within a five-minute walk?
6. Cheonggyecheon removed 168,000 vehicles a day and gridlock never came. Why is that evidence still so hard to act on here?

*For the discussion, ← back to "Carrot or stick?" — going back pauses the timer, which is what you want.*`,

  refs: `**Appendix · untimed · after 38:30**

**[0:00] B1 — references & image credits**
- **Full reference list:** the research dossier, *01-Seoul-Research-Dossier.md* — §10, 105 sources in seven groups (SMG, Seoul Solution, international organisations, peer-reviewed, buildings, news, NYC) — and **the submitted PDF**, per the assignment
- If a number is challenged: the dossier's **"Figures to Avoid or Hedge"** appendix has the honest answer for every conflicting source
- Photo credits for every image slide are on this slide and listed below`,

  qa: `**Questions · untimed · 5 minute countdown**

**[0:00] B1 · Questions**
- repeat each question so the whole room hears it
- the discussion prompts are in the study guide
- Tab or T pauses the countdown · it turns red in the last 30 seconds

**Next:** Thank You`,

  thanks: `**Closing · untimed**

**[0:00] B1 · Thank You**
- say thank you · the slide shows instagram: erickson_architecture
- this is the last slide`,
};

// ---------------------------------------------------------------------------
// Runtime: photo credits from spec/images.json (IMAGES session; may be missing or partial).

const SIDES = [
  ['seoul', 'SEOUL'],
  ['nyc', 'NEW YORK'],
];

function pairsOf(images) {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  if (Array.isArray(images.pairs)) return images.pairs.filter(Boolean);
  if (typeof images === 'object') return Object.values(images).filter((p) => p && typeof p === 'object' && p.id);
  return [];
}

// Credit text comes from Wikimedia/Openverse metadata: strip any HTML, collapse whitespace,
// and backslash-escape the markdown characters the notes renderer would otherwise interpret.
function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[–—]\s*/g, ', ')
    .trim()
    .replace(/([\\*_`[\]<>~#|])/g, '\\$1');
}

function photoLine(side, place) {
  const label = `**${clean(side.place) || place}${side.subject ? ' · ' + clean(side.subject) : ''}**`;
  const year = side.year ? ` (${clean(side.year)})` : '';
  const credit = clean(side.credit);
  const license = clean(side.license);
  const parts = [credit || 'credit missing'];
  if (license && !credit.includes(license)) parts.push(license);
  let line = `- ${label}${year}: ${parts.join(' · ')}`;
  if (side.present === false || (side.present == null && side.status === 'user-supply')) {
    line += `\n  - **PHOTO NEEDED:** ${clean(side.userSupplyNote) || 'no open-licence photo found yet'}`;
  } else if (side.status === 'low-res') {
    const size = side.width && side.height ? ` (${Number(side.width)}×${Number(side.height)} px)` : '';
    line += `\n  - **LOW-RES${size}:** may look soft on the projector${side.codexUpscalePrompt ? '; upscale prompt is in spec/images.json' : ''}`;
  }
  return line;
}

function creditsBlock(pair, id) {
  if (!pair) return `**Photo credits**\n- *Photos for ${id} not delivered yet; placeholder panels are on screen.*`;
  const lines = SIDES.map(([k, place]) => {
    const side = pair[k];
    if (!side || (!side.file && side.status !== 'user-supply')) {
      return `- **${place}:** *photo not delivered yet; placeholder panel on screen*`;
    }
    return photoLine(side, place);
  });
  return `**Photo credits**\n${lines.join('\n')}`;
}

/**
 * Speaker notes for one slide, with photo credits appended where relevant.
 * @param {string} key      timing.json key: 's01'…'s20', 'i01'…'i18', 'refs'
 * @param {object|Array|null} images  parsed spec/images.json ({ pairs: [...] }), a pairs array, or null
 * @param {string} [override]  notes markdown from spec/notes-v2.json; replaces NOTES[key] when non-empty
 * @returns {string} markdown
 */
export function notesFor(key, images, override) {
  let base = typeof override === 'string' && override.trim() ? override : NOTES[key] || '';
  // The Questions and Thank You slides now follow the appendix (spec/qa-slide.md).
  if (key === 'refs') base = base.replace(/\*\*Next:\*\*[^\n]*/, '**Next:** Questions, with the 5 minute countdown');
  const pairs = pairsOf(images);
  if (/^i\d\d$/.test(key)) {
    const pair = pairs.find((p) => p.id === key);
    return `${base}\n\n${creditsBlock(pair, key)}`;
  }
  if (key === 'refs') {
    const ids = Array.from({ length: 18 }, (_, i) => `i${String(i + 1).padStart(2, '0')}`);
    const blocks = ids.map((id) => {
      const pair = pairs.find((p) => p.id === id);
      const theme = pair && pair.theme ? `: ${clean(pair.theme)}` : '';
      return creditsBlock(pair, id).replace('**Photo credits**', `**${id}${theme}**`);
    });
    return `${base}\n\n${blocks.join('\n\n')}`;
  }
  return base;
}

export default NOTES;
