# Motion integration

## Latest timing policy: user-requested half speed and magnitude emphasis

This policy supersedes the original durations in ARCHITECTURE.md and the initial task: animation speed is 50%, so non-counter durations and stagger intervals are doubled. Slide crossfade is 440 ms; arrivals are 900 ms with 140 ms sibling staggering; draw growth is 1400 ms. Photo push-in defaults to 20 seconds, with caption delay 800 ms and fade 900 ms. An explicit `startPhoto` duration remains literal, including zero for instant mode. Slide/beat cue schedules in timing.json are unchanged.

Counter durations are based on absolute numeric magnitude, including M/million, B/billion and K/thousand suffixes. Signs, currency prefixes and other units do not change the magnitude. A duration starts at that element's stagger offset.

| Magnitude | Count duration |
| --- | --- |
| Below 1,000 | 1.8 seconds |
| 1,000 to below 10,000 | 2.4 seconds |
| 10,000 to below 100,000 | 3 seconds |
| 100,000 to below 1 million | 4 seconds |
| 1 million to below 10 million | 5 seconds |
| 10 million to below 100 million | 6 seconds |
| 100 million to below 1 billion | 7 seconds |
| 1 billion and above | 8 seconds |

Examples: 67% = 1.8 s, ₩65,000 = 3 s, 540,000 = 4 s, 2.04M TOE = 5 s, 10 million = 6 s, US$1.46 billion = 8 s. MW is a unit, not a million multiplier. Formatting precision stays unchanged during counting; the rounded display is capped below the target until its duration expires, then the exact authored string appears. Skipped years and ranges, reduced motion, instant mode and interrupt-to-end remain unchanged. The API and allowed file ownership remain unchanged.

DONE: module, 29 public-API unit tests, standalone demo, classic bundle, strict offline browser audit and inspected screenshots. No renderer, stylesheet, spec, dependencies or other agents' files were edited. Integration into the live deck remains the MAIN agent's work.

## Exact markup assignment

Add `data-motion="count"` to the following existing text elements, addressed by slide key and `data-id`. If copy overrides remove an element, skip it. Apply only to visible HTML, never to a diagram's DOM labels or a `.fb-off` fallback.

| Slide | Element IDs | Value |
| --- | --- | --- |
| s02 | 5:36, 5:40, 5:41 | 67%, LEND AT 1.75%, FINE $268/TON |
| s03 | 5:53, 5:57 | 67% (only when their HTML fallback is visible) |
| s03 | 5:65 | Wrap only `52.34` in a count span; leave the rich `Mt CO₂e` unit markup intact |
| s05 | 8:84, 8:85 | 52.34, −50% (HTML fallback only) |
| s06 | 8:371 | 2.04M TOE |
| s07 | 8:493, 8:500, 8:505 | 540,000, 357.1 MW, US$1.46 billion |
| s08 | 8:529, 8:543 | 1.75%, $268 |
| s11 | 10:30 | 121 units |
| s15 | 13:13, 13:16 | 457 t/day, +80 t |
| s18 | 14:60, 14:62, 14:70, 14:81 | +11 km/h, −24%, ₩65,000, 10 million |
| s19 | 14:113, 14:122, 14:131 | 1.75%, 540,000, ₩65,000 |

Keep headlines, paragraphs, timeline years, ordinal list numbers, grade numbers, and ranges unmarked. In particular leave s11 10:5, s18 14:46/14:49/14:64, s19 14:109/14:127 and s20 14:160 unmarked. Mark a plain-text numeric span within rich text rather than its rich-text parent. The parser defensively skips all integer values from 1900 through 2100, any text containing the word `to`, multiple numeric tokens and rich markup. A skipped counter keeps its text intact; its containing beat still receives the ordinary arrival.

For `data-motion="draw"`, mark s07 `8:499` (the progress fill), never `8:498` (its background track). Also mark the HTML thin rules listed in the generated rule inventory below, excluding any element currently replaced by an active diagram. Do not mark building geometry, panel backgrounds, circles, donut arcs, photo gutters, or diagram-owned bars. The long axis is measured once per reveal: taller means scaleY from bottom; otherwise scaleX from left. Existing transforms, including rotation, are composed with motion.

For all i01 through i18, mark `.img-panel.seoul > img` and `.img-panel.nyc > img` with `data-motion="photo"`. Pass their parent `.img-panel` to `startPhoto`. Existing `.img-cap` is recognized automatically; alternatively use `data-motion-caption` or `figcaption`. Keep the panel clipped with `overflow:hidden`. Missing image panels need no photo marker. Caption is outside the scaled image.

## Engine call sites

1. Import the seven exports from `motion.js` in the engine source; esbuild bundles them into the deck's existing classic inline script. No runtime imports, requests, workers or libraries are added.
2. During `buildDeck`, create one stable wrapper per beat, with the beat's elements as direct children in intended reveal order. The current renderer has flat `.el[data-beat]` siblings; do not call `revealBeat` on one of those text leaves. A wrapper can use `display:contents` to retain the existing absolute-position containing block. Keep wrappers outside diagram slots. Call `hideBeat(wrapper, {instant:true})` initially.
3. Retire `.off` and the CSS `translate` reveal on motion-managed elements: remove `.off`, set `translate:none`, and let this module own inline `opacity`, `transform` and `transition:none`. It preserves the authored `--o` opacity. Do this before first use so base transforms are captured from the authored state. Do not independently mutate those properties while motion is active.
4. In `show()` on a slide change, call `leaveSlide(old.section)` then `enterSlide(next.section)` synchronously. Keep BOTH sections displayed/stacked for the 440 ms crossfade. These functions also return promises, so await both before removing the old current/display class and revealing the new first beat. Guard asynchronous continuation with a navigation generation token so rapid clicks cannot reveal a stale slide. `enterSlide` preserves a running leave solely to support this paired crossfade; any new navigation's `leaveSlide` first finishes everything older.
5. In `setVisible`, call `revealBeat(wrapper,{instant})` once for each newly visible beat. Direct children get a 140 ms stagger; descendants marked count/draw start at their direct ancestor's stagger offset. Await if sequencing multiple animated groups. Starting another reveal finishes every old animation and resolves its promise before starting the new beat. Repeated reveals are harmless. Do not invoke it on every timer tick.
6. For backwards beat movement call `hideBeat` on wrappers now beyond the visible beat. Hide is immediate in both modes, restores counter DOM, clears reveal bookkeeping and sets aria-hidden. A subsequent reveal plays again. For fully built revisits, previews, static screenshots and print use `instant:true` for slide entry and every visible beat. No frames are scheduled in instant or reduced mode.
7. For images, reveal Seoul's panel at cue 0 and New York's at cue 4, following `timing.json`. Call `startPhoto(panel)` immediately after starting that panel's beat reveal (not before it) for the new 20-second default. The deck engine can pass an explicit duration to fit its existing 10-second interstitial schedule. Photo playback does not interrupt the entry/reveal. Keep the returned stop callback for each panel. Each next beat or slide deliberately finishes older motion, including photo motion, to obey the interruption contract. A photo's duration is measured from its own appearance; use the remaining slide time instead if MAIN wants a common endpoint. Caption starts at 800 ms and fades for 900 ms. Push-in uses smooth ease-in-out over the requested duration.
8. Stop callbacks jump to final photo scale/caption opacity and cancel frames; call on panel disposal or departure. For a fully built preview/print call `startPhoto(panel,{durationMs:0})`, or call `finishAll()` after starting photos. Call `finishAll()` on jump-to-end, deck disposal, and before printing. It resolves pending reveal promises synchronously and removes scheduled frames. Navigation owns timing; this module never advances a beat or slide.

`reducedMotion` is a live export, initialized with matchMedia and updated on preference changes. Enabling it finishes all active jobs. No timers or CSS animations are used. WeakMaps/WeakSets retain base styles and idempotence state only while their DOM nodes are alive; the running Set contains only active work. One media-query listener lives for the module lifetime, not one per slide.

Counters keep the original text nodes in an opacity-zero reserve and place an aria-hidden absolute counter over them. Temporary position/display styles are set once for inline spans, never interpolated. Only transform and opacity are animated; number text changes are the required counter exception. At completion, the original nodes and position/display styles return exactly. Prefixes, sign characters, precision, commas and units are kept; final text is never regenerated numerically.

## Demo and validation

Double-click `codex/motion-demo.html`. It includes its classic bundle, three Montserrat weights and a local Seoul photo as data URIs. Nothing needs to sit beside it. The revised demo includes a bar chart, a line graph and a conceptual 2D retrofit process diagram, each with its own replay button. Chart data is visibly labeled illustrative.

Play full animation explicitly enables full motion in the DEMO and runs numbers, rules, charts, diagram and photo in sequence. Replay numbers immediately restarts all 16 numeric samples from zero. Jump to end cancels pending continuation and shows final content. The Use system motion preference button restores native reduced motion. On initial load, native reduced motion suppresses autoplay and explains which button enables the preview; otherwise the full sequence starts after fonts load. The deck module remains unchanged and always honors native reduced motion. The demo-only matchMedia adapter implements the explicit user preview override before the inline bundle loads.

Rebuild: `node codex/build-motion-demo.mjs`. This writes only demo outputs in codex, reading the module, installed esbuild/font files and assets/img/i01-seoul.jpg. The separately requested CLI bundle command also ran successfully:

```
node node_modules/esbuild/bin/esbuild src/engine/motion.js --bundle --format=iife --global-name=Motion --outfile=codex/motion-demo.bundle.js
node --test src/engine/motion.test.mjs
node scripts/shot.mjs codex/motion-demo.html --query snapshot=final --out codex/motion-final.png --strict --offline
node scripts/shot.mjs codex/motion-demo.html --query snapshot=mid --out codex/motion-mid.png --strict --offline
node scripts/shot.mjs codex/motion-demo.html --query snapshot=final --strict --offline --dom
```

29 tests pass. The strict offline DOM audit passes all seven assertions: intermediate number, reserved widths, stagger delay, exact final values, zero queued frames, replay and jump interruption. Both screenshots were visually inspected at 1920x1080: text stays separated, the intermediate frame shows staggered arrivals and counts, and the final frame shows all numbers, both draw axes, photo and caption. Snapshot query mode uses a deterministic rAF clock and forces motion on to inspect interpolation even if the OS requests reduced motion; normal mode uses native rAF and native preferences. Unit tests separately verify reduced motion at import and during playback. Headless Chrome required sandbox escalation to start; no visible windows were opened.

Revision validation: the browser audit now has 18 passing assertions, including bar values plus scale, rotated line-segment scale, staggered diagram steps, growing vertical connectors, explicit preview control, system preference restoration and no overflow. All 29 module tests still pass. Inspected `motion-expanded-final.png` and `motion-charts-mid.png` at 1920x1500; inspected `motion-mobile-390.png` with an actual 390 CSS pixel srcdoc viewport. Chromium's CLI window has a minimum width, so `build-mobile-check.mjs` creates a local test frame for the required headless helper; the first direct narrow screenshot was discarded as viewport evidence. The 390px frame independently passes all 18 browser assertions. No deck renderer or diagram-agent source was edited. Actual deck-wide chart integration is still MAIN's task using the markup assignments and calls above.

## Thin-rule inventory

Selection from the current spec: rectangles with a short dimension at most 4 px and aspect ratio at least 20. These are explicit draw candidates; keep only visible HTML after diagram replacement and copy removal.

- s01: 5:12, 5:13
- s02: 5:26, 5:30, 5:34, 5:38
- s03: 5:64
- s04: 17:2, 17:4, 17:8, 17:12, 17:16
- s05: 8:79, 8:80, 8:87, 8:92, 8:96, 8:100
- s06: 8:369, 8:373
- s07: 8:496, 8:504
- s09: 9:18, 9:21, 9:26, 9:29, 9:32, 9:34, 9:38
- s10: 12:5, 12:7, 12:8, 12:9, 12:10, 12:11, 12:12, 12:13, 12:14, 12:15, 12:16, 12:17, 12:18, 12:19, 12:20, 12:21, 12:22, 12:23, 12:24, 12:25, 12:26, 12:27, 12:28, 12:29, 12:30, 12:31, 12:32, 12:33, 12:34, 12:35, 12:36, 12:37, 12:38, 12:39, 12:63, 12:64, 12:65, 12:66, 12:69, 12:72, 12:75, 12:78, 12:82, 12:86, 12:90
- s11: 10:28, 10:34
- s12: 10:99, 10:100, 10:102, 10:104, 10:106, 10:110
- s13: 12:130, 12:134
- s14: 12:163, 12:164, 12:166, 12:168, 12:170, 12:176, 12:179, 12:182, 12:185
- s15: 13:15, 13:18, 13:22
- s16: 13:55, 13:71, 13:92, 13:115
- s17: 14:14, 14:17, 14:22, 14:31
- s18: 14:59, 14:66, 14:80
- s19: 14:105, 14:114, 14:123, 14:132
- s20: 14:156, 14:157
