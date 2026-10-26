# Tasks for Codex (local, on this computer)

Codex works directly in the shared workspace folder:

**`C:\Users\erick\AppData\Local\Temp\claude\seoul-deck`**

It creates only its own new files there. It does not use git; Claude's checkpoint command saves its files to GitHub automatically, so nothing gets overwritten. Paste one task at a time. Task 1 is the important one. Tasks 2 and 3 are optional.

---

## Task 1: 2D animation library

```
Work in this folder: C:\Users\erick\AppData\Local\Temp\claude\seoul-deck

IMPORTANT: other AI agents are editing this folder right now. Create and edit ONLY these files: src/engine/motion.js, src/engine/motion.test.mjs, and anything inside a new folder codex/. Do not change any other file. Do not run npm install (node_modules already has three, esbuild and @fontsource/montserrat). Do not use git. Never open a visible window on the desktop: test headless only. For screenshots, use the existing helper: node scripts/shot.mjs <page.html> --out codex/<name>.png --strict

Context: this is a native HTML presentation (38 timed slides) for an architecture class. It must run by double-clicking one HTML file on a college computer with nothing installed: no network, no ES modules at runtime, no workers, no external libraries. Read ARCHITECTURE.md (sections 1 and 3 and the HARD CONSTRAINT box at the top), src/engine/INTERFACES.md, spec/timing.json (each slide's "beats": groups of content that appear one after another while the speaker talks), and src/engine/slides.js (read only, to see how beat groups are marked with data-beat).

Task: write a 2D motion module that the deck engine will call, plus tests and a demo.
- src/engine/motion.js (ES module; the deck bundles it with esbuild)
- src/engine/motion.test.mjs (node:test; run with: node --test src/engine/motion.test.mjs)
- codex/motion-demo.html, a standalone page showing every animation on sample content, with buttons to play, replay and jump to the end. It must work by double-click from file://, so bundle motion.js for it as a classic script: node node_modules/esbuild/bin/esbuild src/engine/motion.js --bundle --format=iife --global-name=Motion --outfile=codex/motion-demo.bundle.js

API (exact):
  export function enterSlide(sectionEl, { instant = false } = {})   // slide transition in: 220 ms crossfade
  export function leaveSlide(sectionEl, { instant = false } = {})   // transition out
  export function revealBeat(groupEl, { instant = false } = {})     // returns a Promise
  export function hideBeat(groupEl, { instant = false } = {})       // for going back
  export function finishAll()                                       // jump every running animation to its end state
  export function startPhoto(panelEl, { durationMs = 10000 } = {})  // returns stop()
  export const reducedMotion                                        // true when prefers-reduced-motion is set

revealBeat animates the group's children in order with a 70 ms stagger: opacity 0 to 1 plus a 16 px upward rise, 450 ms, ease-out cubic. Inside the group, elements marked:
  data-motion="count": the number counts up from 0 over 900 ms, ease-out. The final text must end up EXACTLY as written (keep prefixes, suffixes, signs, decimals, thousands separators, units). Formats in this deck include 67%, 52.34, 2.04M TOE, 540,000, 357.1 MW, US$1.46 billion, 1.75%, $268, ₩65,000, 10 million, −50% (U+2212 minus), +80 t, 457 t/day, +11 km/h, −24%, 121 units. Do NOT animate years (1900 to 2100) or ranges written with "to" (like "9 to 31%" or "75 to 80%"); show those instantly. Reserve the final width so the layout never shifts while counting.
  data-motion="draw": bars, rules and progress fills grow from zero along their length (scaleX from the left edge, or scaleY from the bottom when the element is taller than it is wide), 700 ms, ease-out.
  data-motion="photo": used by startPhoto. A slow push-in from scale 1.00 to 1.04 over the slide's 10 seconds, plus the caption fading in 400 ms after the photo appears.

Rules: animate only transform and opacity (no layout properties); requestAnimationFrame only; no libraries; instant:true or reduced motion goes straight to the end state with no frames; interrupt-safe (if a new beat or slide starts while something is still animating, the old animation jumps to its end state first, because the presenter may press the clicker quickly); idempotent (revealing twice is harmless); hideBeat returns the group to its hidden state cleanly; no memory leaks across 38 slides; no em dashes or en dashes in any visible text; the demo uses Montserrat and the palette in ARCHITECTURE.md (white #FFFFFF, ink #111112, red #CD2E3A, blue #0047A0).

Done means: node --test src/engine/motion.test.mjs passes (cover number parsing and formatting for every format above, skipped years and ranges, instant mode, reduced motion, interrupt and finishAll); codex/motion-demo.html works by double-click; you looked at headless screenshots of it; and you wrote codex/MOTION-NOTES.md listing exactly which deck elements should get which data-motion value and where the engine should call each function.
```

---

## Task 2 (optional): study guide page. Wait until Claude says `spec/study-v2.json` is ready

```
Work in this folder: C:\Users\erick\AppData\Local\Temp\claude\seoul-deck

IMPORTANT: other AI agents are editing this folder right now. Create and edit ONLY scripts/build-study.mjs and files inside codex/study/. Do not change any other file, do not run npm install, do not use git, and never open a visible window (test headless with node scripts/shot.mjs <page.html> --out codex/study/<name>.png --strict).

Task: build a self-contained study guide page for a student presenting "Seoul: The Carrot and the Stick" (Seoul vs New York sustainability policy). scripts/build-study.mjs reads spec/study-v2.json and spec/study-v2-extras.json and writes codex/study/Seoul-Study-Guide.html: ONE file with all CSS and JS inline and Montserrat inlined as base64 from node_modules/@fontsource/montserrat/files/. It must work by double-click with no internet.

Input: study-v2.json = { "slides": [ ... ] } in deck order. Content slides: { key, title, inOneSentence, background: [paragraphs], numbers: [ { value, meaning, source, confidence: "solid"|"varies"|"hedge", note } ], explainSimply, sayThis: [lines], questions: [ { q, a } ], dontSay: [items], terms: [ { term, meaning } ], nycLink }. Photo slides (keys i01 to i18): { key, title, seoul, nyc, why }. Appendix (refs): { key, title, howToCite, keySources: [items] }. study-v2-extras.json = { thesis, runOfShow: [ { key, title, dur, start, end } ], glossary: [ { term, meaning } ], fiveThings: [items], flashcards: [ { front, back } ], keys: [items] }.

Page: a clean study layout in the deck's look (white background, ink #111112, red #CD2E3A for Seoul, blue #0047A0 for New York, Montserrat), with light and dark themes. Sections: the thesis and "five things to remember" at the top; the run of show as a timing table; one section per slide (key numbers as a table with a small solid/varies/hedge chip, "say this" lines styled as quotes, likely questions as click-to-open answers, "don't say" as a caution list, terms); the glossary; a flashcards mode (flip, next, shuffle, keyboard arrows); a search box that filters slides. Readable at phone width. No em dashes or en dashes anywhere in the UI text.

Done means: node scripts/build-study.mjs produces the file, it opens offline, every slide from the JSON appears, and you checked headless screenshots.
```

---

## Task 3 (optional): full deck check. Wait until Claude says the final build is published

```
Work in this folder: C:\Users\erick\AppData\Local\Temp\claude\seoul-deck

IMPORTANT: other AI agents are editing this folder right now. Create and edit ONLY files inside codex/qa/. Do not change any other file, do not run npm install, do not use git, and never open a visible window.

Task: check the finished presentation and report problems. Do not fix anything. Use the headless helper: node scripts/shot.mjs <page> --query "<params>" --out codex/qa/<name>.png --strict --offline (add --dom to print the page's audit JSON). Test dist/Seoul-Presentation.html: for every slide key in spec/timing.json and every beat, use ?slide=<key>&beat=<n>&static=1 for screenshots and ?audit=all with --dom for the overlap and error audit. Also check ?view=presenter&simulateScreens=2 and ?view=print, and the viewport sizes 1366x768, 1920x1080 and 3840x2160 (--w and --h). Run at most 3 at a time. Open the screenshots and look at them. Also test the approved motion (ARCHITECTURE.md section 13) end to end in the built deck with a small headless script of your own inside codex/qa/ (Chrome DevTools protocol or Playwright if already available; do not npm install into the workspace root): rapid clicking (several Right/PageDown presses within a second never skip content or leave a half-finished reveal), back navigation (earlier slides come back fully built; the timer pauses on going back and the next press only resumes it), prefers-reduced-motion (everything appears instantly), and strict offline playback (no network requests, no runtime errors). Write codex/qa/REPORT.md listing every runtime error, every overlap the audit reports, any text that is clipped or outside the slide, any slide that looks blank or broken, and anything that looks unfinished, each with the screenshot file name.
```
