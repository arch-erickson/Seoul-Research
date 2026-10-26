# Tasks for Codex

Copy one task's prompt into Codex at a time. Task 1 matters most. Tasks 2 and 3 are optional and each one saves Claude usage.

**Read this first: one rule for every task.** Codex works in the GitHub repo **https://github.com/arch-erickson/Seoul-Research**, on its own branch, and opens a pull request. **Don't merge Codex's pull requests on GitHub.** Claude saves progress to `main` automatically and that would overwrite them. Instead, tell Claude "Codex PR #N is ready" and Claude brings it into the deck. Use Codex in the cloud connected to the repo, or the Codex CLI in a fresh clone in its own folder, not in Claude's workspace.

---

## Task 1: 2D animation library (most useful)

```
Repo: https://github.com/arch-erickson/Seoul-Research. Create a branch named codex/motion-2d and open a pull request when done. Never push to main.

Context: this is a native HTML presentation (38 timed slides) for an architecture class. It must run by double-clicking one HTML file on a college computer with nothing installed: no network, no ES modules at runtime, no workers, no external libraries. Read ARCHITECTURE.md (sections 1 and 3, and the HARD CONSTRAINT box), src/engine/INTERFACES.md, spec/timing.json (each slide's "beats": groups of content that appear one after another while the speaker talks), and src/engine/slides.js (read only, to see how beat groups are marked with data-beat).

Task: write a 2D motion module that the deck engine will call. Create ONLY these files:
- src/engine/motion.js
- src/engine/motion.test.mjs (node:test; run with node --test)
- dev/motion-demo.html (+ dev/motion-demo.js if needed): a standalone page that shows every animation on sample content, with buttons to play, replay and jump to the end

API (exact):
  export function enterSlide(sectionEl, { instant = false } = {})   // slide transition in: 220 ms crossfade
  export function leaveSlide(sectionEl, { instant = false } = {})   // transition out
  export function revealBeat(groupEl, { instant = false } = {})     // returns a Promise
  export function hideBeat(groupEl, { instant = false } = {})       // for going back
  export function finishAll()                                       // jump every running animation to its end state
  export function startPhoto(panelEl, { durationMs = 10000 } = {})  // returns stop()
  export const reducedMotion                                        // true when prefers-reduced-motion is set
revealBeat animates the group's children in order with a 70 ms stagger: opacity 0 to 1 plus a 16 px upward rise, 450 ms, ease-out cubic. Inside the group, elements marked:
  data-motion="count"  -> the number counts up from 0 over 900 ms, ease-out. The final text must end up EXACTLY as written (keep prefixes, suffixes, signs, decimals, thousands separators, units). Formats in this deck include 67%, 52.34, 2.04M TOE, 540,000, 357.1 MW, US$1.46 billion, 1.75%, $268, ₩65,000, 10 million, −50% (U+2212 minus), +80 t, 457 t/day, +11 km/h, −24%, 121 units. Do NOT animate years (1900 to 2100) or ranges written with "to" (like "9 to 31%" or "75 to 80%"); show those instantly. Reserve the final width so the layout never shifts while counting.
  data-motion="draw"   -> bars, rules and progress fills grow from zero along their length (scaleX from the left edge, or scaleY from the bottom when the element is taller than it is wide), 700 ms, ease-out.
  data-motion="photo"  -> used by startPhoto: a slow push-in from scale 1.00 to 1.04 over the slide's 10 seconds, plus the caption fading in 400 ms after the photo appears.
Rules: animate only transform and opacity (no layout properties); requestAnimationFrame only; no libraries; instant:true or reduced motion goes straight to the end state with no frames; interrupt-safe: if a new beat or slide starts while something is still animating, the old animation jumps to its end state first (the presenter may press the clicker quickly); idempotent (revealing twice is harmless); hideBeat returns the group to its hidden state cleanly; no memory leaks across 38 slides; no em dashes or en dashes in any visible text; the demo uses the Montserrat font stack and the palette in ARCHITECTURE.md (white #FFFFFF, ink #111112, red #CD2E3A, blue #0047A0).
Done means: node --test src/engine/motion.test.mjs passes (cover number parsing and formatting for every format above, skipped years and ranges, instant mode, reduced motion, interrupt and finishAll), the demo page works by double-click from file://, and the PR description lists exactly which elements the engine should mark with data-motion and where to call each function.
```

---

## Task 2 (optional): study guide page

Start this **after** Claude tells you `spec/study-v2.json` is in the repo. Claude's writing workflow is still producing it.

```
Repo: https://github.com/arch-erickson/Seoul-Research. Create a branch named codex/study-guide and open a pull request when done. Never push to main.

Task: build a self-contained study guide page for a student presenting "Seoul: The Carrot and the Stick" (Seoul vs New York sustainability policy). Create ONLY scripts/build-study.mjs, which reads spec/study-v2.json and spec/study-v2-extras.json and writes dist-study/Seoul-Study-Guide.html: ONE file with all CSS and JS inline and Montserrat inlined as base64 (from node_modules/@fontsource/montserrat after npm install). It must work by double-click with no internet.
Input format: study-v2.json = { "slides": [ ... ] } in deck order. Content slides: { key, title, inOneSentence, background: [paragraphs], numbers: [ { value, meaning, source, confidence: "solid"|"varies"|"hedge", note } ], explainSimply, sayThis: [lines], questions: [ { q, a } ], dontSay: [items], terms: [ { term, meaning } ], nycLink }. Photo slides (keys i01..i18): { key, title, seoul, nyc, why }. Appendix (refs): { key, title, howToCite, keySources: [items] }. study-v2-extras.json = { thesis, runOfShow: [ { key, title, dur, start, end } ], glossary: [ { term, meaning } ], fiveThings: [items], flashcards: [ { front, back } ], keys: [ items ] }.
Page: a clean study layout in the deck's look (white background, ink #111112, red #CD2E3A for Seoul, blue #0047A0 for New York, Montserrat), light and dark themes. Sections: the thesis and "five things to remember" at the top; the run of show as a timing table; one section per slide (key numbers as a table with a small solid/varies/hedge chip, "say this" lines styled as quotes, likely questions as click-to-open answers, "don't say" as a caution list, terms); the glossary; a flashcards mode (flip, next, shuffle, keyboard arrows); a search box that filters slides. Readable at phone width. No em dashes or en dashes anywhere in the UI text.
Done means: node scripts/build-study.mjs produces the file, it opens offline, every slide from the JSON appears, and the PR includes a screenshot.
```

---

## Task 3 (optional, after Claude publishes the real deck): live site check

```
Repo: https://github.com/arch-erickson/Seoul-Research. Create a branch named codex/qa-live and open a pull request with the report. Never push to main.

Task: write scripts/qa-live.mjs (Playwright, Chromium, headless) and run it. It loads https://arch-erickson.github.io/Seoul-Research/ and https://arch-erickson.github.io/Seoul-Research/Seoul-Presentation.html and, for every slide and every beat (use the URL params ?slide=<key>&beat=<n>&static=1 and ?audit=all described in ARCHITECTURE.md section 8), records console errors, failed requests, and the JSON the page writes into <script id="audit-result" type="application/json">. Also load ?view=presenter&simulateScreens=2 and ?view=print. Test at 1366x768, 1920x1080 and 3840x2160. Save one screenshot per slide at 1920x1080 into qa/ and write qa/REPORT.md listing every error, every overlap the audit reports, any text that is clipped or outside the slide, and any slide that looks blank. Don't change any other file.
```
