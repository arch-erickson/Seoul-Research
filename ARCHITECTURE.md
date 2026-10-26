# Seoul Deck — Architecture & Cross-Session Contract

Native HTML presentation for ARCH 3551 ("Seoul — The Carrot and the Stick"), presenting tomorrow.
Three Claude sessions build it in parallel. **This file is the contract between them.** If you need
to change anything in it, write the request into your STATUS file instead of editing this file.

Workspace (no spaces, outside OneDrive on purpose — OneDrive sync locks break parallel builds):
`C:\Users\erick\AppData\Local\Temp\claude\seoul-deck\`  (bash: `/c/Users/erick/AppData/Local/Temp/claude/seoul-deck`)

Course folder (final delivery only, copied at the end by the MAIN session):
`C:\Users\erick\OneDrive\Documents\CUNY\Fall 2026\ARCH 3551- Sustainability History & Practice\Research Presentation\`
— path contains spaces **and an ampersand**; always quote it, and URL-encode it in file:// URLs.

Research facts (the only allowed source of numbers): `<course folder>\01-Seoul-Research-Dossier.md`

> ### HARD CONSTRAINT: pure HTML, nothing to install (user, latest)
> "All of the presentation actions should work smoothly within the html without any outer tools or setups, because it will be on a college computer and I cannot install or set anything up outside of the html."
> - The deck runs in two ways only: (1) the live link **https://arch-erickson.github.io/Seoul-Research/** in Chrome/Edge, and (2) **one self-contained file `Seoul-Presentation.html`** opened by double-click (`file://`) with **no browser flags**.
> - **No servers, no `.cmd`/`.bat` launchers, no Node at presentation time, no extensions.** `server.mjs` and `Present.cmd` are removed.
> - Presenter view lives **in the same file**: `?view=presenter`, opened by the deck itself with `window.open` on a key press.
> - In `file://` Chrome blocks `fetch`/XHR of local files, ES-module imports, Web Workers from files, WebGL textures from local images, and **web fonts loaded from separate files**. So: everything is bundled into classic scripts, JSON is inlined, **fonts are inlined as base64 in the CSS**, no workers, no textures, and in the single-file build the images are inlined as base64 too.
> - **Test like the college PC:** verify with `node scripts/shot.mjs ... --strict` (no `--allow-file-access-from-files`), and against the live https site. Testing must be headless only: never run a `.cmd`/`.bat`, never start a server, never open a visible window on the user's desktop.
Original Figma Slides deck (design reference, 20 slides): https://www.figma.com/slides/jA0o1Jz3TGfp9wySwCQF5u

---

## 0. Sessions and file ownership

| Session | Owns (may create/edit) | Must not touch |
|---|---|---|
| **MAIN** (deck engine) | `src/engine/**`, `src/slides/**`, `src/styles/**`, `assets/fonts/**`, `scripts/build.mjs`, `scripts/shot.mjs`, `spec/slides.json`, `spec/timing.json`, `dist/**`, `index.html`, `presenter.html`, `Present.cmd`, `server.mjs`, `STATUS-MAIN.md` | other sessions' files |
| **3D** (diagrams) | `src/kit3d/**`, `src/diagrams/**`, `src/data/**`, `dev/**`, `scripts/build-diagram.mjs`, `.tmp/3d/**`, `STATUS-3D.md` | everything else |
| **CODEX** (local, on the user's request) | `src/engine/motion.js`, `src/engine/motion.test.mjs`, `scripts/build-study.mjs`, `codex/**` | everything else |
| **IMAGES** | `assets/img/**`, `spec/images.json`, `.tmp/img/**`, `STATUS-IMAGES.md` | everything else |

Shared read-only inputs: this file, `spec/timing.json`, `spec/diagram-briefs.md`, `spec/image-pairs.md`, `scripts/shot.mjs`, `node_modules/`.
Do **not** run `npm install` in the workspace (it is already installed; concurrent installs corrupt `node_modules`). If you need an extra tool (e.g. an image library), install it in your own `.tmp/<session>/` folder.

No git repo here. There is no undo — never delete or overwrite a file you don't own.

**Signalling progress:** keep your `STATUS-*.md` current: one line per deliverable (`DONE` / `IN PROGRESS` / `BLOCKED: reason`), plus any contract-change requests. The MAIN session integrates from these.

---

## 1. Design system (locked — the user approved these)

| Token | Value | Use |
|---|---|---|
| paper | `#FFFFFF` | slide background (pure white — the Taegukgi field) |
| ink | `#111112` | text, primary lines |
| muted | `#6B6D70` | secondary text |
| rule | `#DBDAD7` | hairlines |
| faint | `#EDEDEA` | track fills, subtle planes |
| **red** | `#CD2E3A` (taeguk red) | Seoul, the single focal number/part. Max 2 red elements per slide. |
| **blue** | `#0047A0` (taeguk blue) | New York, secondary data |

- **Typeface: Montserrat only** (vendored woff2 from `node_modules/@fontsource/montserrat`). Weights used: 900 Black (headlines), 700, 600, 500, 400, 300. In Figma the 600 style is named `SemiBold`.
- **No subtitles** under headlines. **No source/citation lines** on slides (citations live in the dossier, the notes, and the appendix slide).
- **HARD RULE — NO OVERLAP.** No text may overlap any other text, and no text may overlap any line, shape, mesh or image it does not deliberately sit inside (a number inside a donut ring is "inside"; a label sitting on a beam is a violation). Leader lines may touch only their own label's anchor. This is verified mechanically (§8), not by eye.
- Stage is **1920 × 1080** logical px, letterboxed and scaled to any viewport. All coordinates in specs are stage px.
- Headline style: Montserrat 900, ~82–92 px, letter-spacing −3%, line-height 100%, ink (second line sometimes red).
- Motion language (from the animation-kit reference): arrivals **ease-out**, departures **ease-in**, internal movement **ease-in-out**; 400–1200 ms; stagger siblings 60–90 ms; nothing bounces; reduced-motion = instant.

---

## 2. Slide sequence & timing — `spec/timing.json`

38 timed slides: the 20 content slides from Figma, plus 18 **image interstitials** (`i01`–`i18`, Seoul vs New York, **10 s each**) placed directly after content slides 1–18. Plus one untimed appendix slide (references + image credits) at the end.
Total planned run: **38:30** (content 35:30 + 18 × 0:10).

Each slide has **beats** — sequential reveals timed to speech. `timing.json` gives each beat a `cue` (seconds from slide entry), which HTML groups appear, and which state each diagram goes to. Image interstitials have 2 beats: Seoul at 0:00, New York at 0:04.

---

## 3. Engine state machine (MAIN implements in `src/engine/state.js`, pure + unit-tested)

State: `cur` (slide index), `beat` (0-based; beat 0 = first beat, shown on entry), `furthest` (highest index reached moving forward), `timer = { running, pausedByBack, globalMs, slideMs[] }`, `autoBeats` (default **on**), `beatOffsetMs`.

**Navigation**
- `next()` (→ ↓ Space Enter PageDown, clicker forward):
  1. If `timer.pausedByBack` → **resume the timer only** (`running=true`, `pausedByBack=false`). Do not move. *(User's explicit rule: after going back, the first forward press only resumes the timer; the following press advances.)*
  2. Else if more beats remain on this slide → `beat++` (reveal).
  3. Else → advance to `cur+1`. If `cur+1 > furthest`: enter at `beat=0`, play builds, `furthest=cur+1`. If `cur+1 <= furthest` (already presented): enter **fully built** (all beats).
  4. Entering any slide forward starts the timer if it is not running ("going to the next slide, the timer starts").
- `prev()` (← ↑ PageUp Backspace, clicker back):
  - On the live slide (`cur == furthest`, entered forward) with `beat > 0` → `beat--` (un-reveal). Timer keeps running.
  - Otherwise → go to `cur-1`, **fully built**, and **pause the timer** (`running=false`, `pausedByBack=true`).
- `goto(i)`: `i < cur` behaves like prev (pause, fully built); `i > cur` behaves like next (timer runs; builds play only if `i > furthest`).
- `nextSlide()` (Shift+→ or N): skip remaining beats, advance.
- Never auto-advance to another slide.

**Auto-beats** (toggle `A`, default on): while the timer runs and `cur == furthest`, beat `k+1` fires automatically when `slideMs[cur] >= cue[k+1]*1000 + beatOffsetMs`. A manual `next()` that fires a beat early/late adds `(actual − scheduled)` to `beatOffsetMs`, preserving the spacing of later cues. `beatOffsetMs` resets on slide entry. Paused timer ⇒ no auto-beats.

**Timer**
- `globalMs` and `slideMs[cur]` accumulate only while `running`. Per-slide time is cumulative across visits.
- `T` toggles pause/resume manually (clears `pausedByBack`). `Shift+T` resets.
- Timer starts on the first forward press from slide 1, or when presentation mode starts.

Other keys: `P` present (second screen if available, else fullscreen), `Shift+P` open presenter window, `F` fullscreen, `B` black, `W` white, `O` toggle on-slide timer overlay, `G`+digits+Enter go to slide, `Home`/`End`, `?` help, `Esc` close overlays/exit fullscreen.

---

## 4. Presenter view & second screen (MAIN)

- **Audience view** (`index.html`): the stage only. The minimal on-slide timer from the Figma design (duration · "ends m:ss" · deck progress bar, top-right) is shown **only when presenting on a single screen**, toggled by `O`. When the presenter view is open, the audience screen shows no timer.
- **Presenter view** (same file, `?view=presenter`, opened as a companion window by the deck): current slide (live), next beat/next slide preview, speaker notes (from Figma, with `[m:ss] Bn` cue markers), per-slide timer (elapsed / planned, amber in the last 15 s, red when over), total elapsed vs plan ("ahead 0:20" / "behind 0:35"), countdown to the next auto-beat, wall clock, big PAUSED banner when `pausedByBack`, buttons for pause/reset/auto-beats/black screen.
- **Second-screen detection:** on load and on `screen` `change` events, read `screen.isExtended` (Window Management API). When a second display appears, show a toast: "Projector detected — press P to present on it". On `P`: `getScreenDetails()` (permission prompt the first time) → `document.documentElement.requestFullscreen({ screen: externalScreen })` for the audience window, then in the same gesture `window.open('presenter.html', …, left/top/width/height of the internal screen)` (Chrome/Edge "fullscreen companion window"). Handle `screenschange` (projector unplugged mid-talk → exit fullscreen cleanly, keep state).
- Detection needs no permission: `screen.isExtended` works on `file://` and https. Placing windows on a specific screen needs the `window-management` permission, which the browser asks for once on the live https site; on `file://` it may be refused. Fallback (permission refused / Firefox / Safari / `file://`): open the presenter window normally and show a short on-screen hint: drag the slide window to the projector and press F.
- If Windows is mirroring the projector (Duplicate mode), there is no second screen: present single-screen with the on-slide timer, and the help overlay mentions Win+P → Extend.
- Sync: the audience window is the state leader. The presenter window sends commands; the leader broadcasts state snapshots. Transport: `postMessage` via `window.opener` / the popup handle (works on `file://`), with `BroadcastChannel('seoul-deck')` as a secondary path on the https site.
- Both windows render slides from the same bundle; previews use diagram `quality:'preview'`.

---

## 5. Diagram module contract (3D session implements; MAIN mounts)

One file per diagram: `src/diagrams/<id>.js`, e.g. `src/diagrams/s10-edc.js`. Ids and regions are listed in `spec/diagram-briefs.md` and `spec/timing.json`.

```js
// src/diagrams/s10-edc.js
export default {
  id: 's10-edc',
  states: 5,                 // highest state index; state 0 = initial (before its first reveal)
  region: { x: 100, y: 300, w: 1110, h: 680 },   // stage px; must match spec/timing.json
  create(ctx) { /* returns an instance */ },
};
// ctx = {
//   container: HTMLElement,      // absolutely positioned at `region`, sized region.w × region.h CSS px (stage px)
//   pixelRatio: number,          // engine-chosen; the stage itself may be CSS-scaled
//   quality: 'high' | 'preview', // preview: low DPR, no continuous loop, render on demand
//   reducedMotion: boolean,
// }
// instance = {
//   setState(n, { instant }) : Promise<void>   // go to state n (0..states). instant=true: jump with no animation
//                                               // (back-navigation, previews, screenshots, PDF). Must be idempotent and
//                                               // must work from any current state (forward or backward).
//   resize(w, h) : void                         // container CSS size changed
//   renderOnce() : void                         // draw one frame synchronously (screenshots / PDF)
//   audit() : { labels: [{ text, rect:{x,y,w,h} }], violations: [string] }   // see §8; rects in container px
//   dispose() : void                            // free GPU resources; the engine creates/disposes on slide changes
// }
```

Rules for diagrams:
- Self-contained: import Three from `three` (and `three/examples/jsm/...`), plus `../kit3d/index.js`. **No network, no textures loaded from files** (WebGL taints file:// images) — geometry, materials and data imports only. Map/geo data lives in `src/data/*.json` and is imported (esbuild inlines it).
- Labels are DOM (CSS2D-style) in **Montserrat**, inside the container, never outside `region`. Label text must come from the brief (facts from the dossier only).
- Render on demand: animate with your own rAF loop only while a transition is running; idle = no frames (projector laptop, presenter window also renders).
- Background transparent; the slide paper (#FFFFFF) shows through. No drop-shadow halos on the HTML side.
- Must look right at both 1920×1080 and a small preview (~480×270 stage scale).

---

## 6. 3D visual language (3D session owns `src/kit3d`)

"White architectural study model": bright, even **white lighting** (hemisphere + soft key from top-left + fill, gentle soft shadows on a near-invisible ground, tone-mapped so whites read white on a projector), off-white matte materials (~#F3F2EE, roughness ≈ 0.9), **elegant lineweights** — crisp ink edge lines from `EdgesGeometry` drawn with `LineSegments2`/`LineMaterial` (screen-space px widths: silhouette ≈ 1.6 px, interior ≈ 0.9 px, hairline ≈ 0.6 px at 1080p, resolution-corrected on resize). Red and blue are reserved for the important information only (the focal part / NYC comparison), never decoration. Orthographic axonometric cameras by default (architectural convention). No neon, no glow, no gradients on solids, no bounce.

---

## 7. Image interstitials (IMAGES session delivers; MAIN lays out)

Files: `assets/img/iNN-seoul.jpg`, `assets/img/iNN-nyc.jpg` (NN = 01..18). Long edge ≥ 1920 px where the source allows (store up to 2560 px), sRGB JPEG q≈85, no watermarks, **no AI-generated images**. Manifest `spec/images.json`:

```json
{ "pairs": [ {
  "id": "i17", "after": 17, "theme": "Elevated road / rail to linear park",
  "seoul": { "file": "assets/img/i17-seoul.jpg", "place": "SEOUL", "subject": "Seoullo 7017",
             "year": "2017", "credit": "Photo: Author / CC BY-SA 4.0 / Wikimedia Commons",
             "license": "CC BY-SA 4.0", "sourceUrl": "https://commons.wikimedia.org/...",
             "width": 2560, "height": 1707, "focal": { "x": 0.5, "y": 0.45 },
             "status": "ok" },
  "nyc":   { "...": "same shape" }
} ] }
```
`status`: `ok` | `low-res` (add `"codexUpscalePrompt"`) | `user-supply` (add `"userSupplyNote"`: a few words on what to find and why). `focal` = normalized point to keep in frame when cropped to a half-slide (960×1080) panel. On-slide caption = `place` + `subject` only (e.g. "SEOUL · Seoullo 7017"); credits go to the notes and the appendix slide.

---

## 8. Build, run, test

- `node scripts/build.mjs` (MAIN) produces, from one code path:
  - `dist/index.html`: the web version for GitHub Pages. JS and CSS inlined, fonts inlined as base64, images as relative files in `dist/assets/img/`.
  - `dist/Seoul-Presentation.html`: the offline version. Identical, except images are inlined as base64 (resized to ≤1920 px, q≈80) so this ONE file is the whole presentation.
  Both are classic scripts only (no ES modules at runtime), JSON inlined, no fetch, no workers. Views: default = audience, `?view=presenter`, `?view=print`.
- URL params understood by the engine: `?slide=<n|key>&beat=<k>&static=1` (jump, no animation), `&audit=1` / `&audit=all` (overlap audit, JSON written into `<script id="audit-result" type="application/json">`), `?view=print` (all slides fully built, for PDF via the browser's own Print → Save as PDF).
- **Screenshots:** `node scripts/shot.mjs <page.html> --query "..." --out .tmp/<session>/x.png [--dom] [--strict]`: headless Chrome with SwiftShader WebGL2, throwaway profile per run (safe to run concurrently). `--dom` prints the `audit-result` JSON. **`--strict` drops `--allow-file-access-from-files` so the page runs exactly like a double-clicked file on the college PC; final checks must use it.**
- **Overlap audit (§1 hard rule):** text-vs-text bounding boxes, text-vs-shape boxes for HTML, and for diagrams `audit()` must report label-vs-label overlaps, labels leaving the region, and label-vs-geometry overlap measured in screen space (e.g. render the scene without labels to an offscreen target and count non-background pixels under each label rect, excluding that label's own leader). Zero violations at every state is the pass bar.
- Python is `py` (3.12), not `python3`. Node 26. Edge and Chrome installed. 16 cores — but SwiftShader screenshots are CPU-heavy; don't run more than ~6 concurrently.

---

## 9. Publishing (GitHub Pages)

The deck is published at **https://arch-erickson.github.io/Seoul-Research/** from the public repo `arch-erickson/Seoul-Research` (served from `docs/` on `main`). Only the MAIN session publishes, with `node scripts/publish-pages.mjs` (builds, checks, mirrors `dist/` into the site repo at `C:\Users\erick\AppData\Local\Temp\claude\seoul-research-site\docs\`, pushes, waits for the Pages build and fetches the key URLs).

Rules every session must keep so the site works online:
- **Relative paths only.** The site lives under `/Seoul-Research/`, so a path starting with `/` breaks.
- **Exact letter case.** GitHub Pages is case-sensitive and Windows is not. A file saved as `i01-Seoul.jpg` but referenced as `i01-seoul.jpg` works locally and 404s online. Keep every asset file name lowercase and reference it exactly. The publish script refuses to push if any reference doesn't match.
- **No file over 95 MB**, and keep images at the sizes in §7.
- Everything in `dist/` is public, including the presenter view and its speaker notes.

---

## 11. The clicker: Norwii N27, native buttons only

The user presents with a Norwii N27. The Norwii Presenter app can't be used on the college PC, so the deck handles the clicker's **factory buttons** with no configuration (official manual: https://www.norwii.com/manualen/374-en.html). Holding both page buttons cycles four modes and the clicker remembers the last one, so all four must work:

| N27 button | Sends (by mode) | Deck action |
|---|---|---|
| Page down, short | Right arrow · Page Down · wheel notch down · Down arrow | next beat / next slide |
| Page up, short | Left arrow · Page Up · wheel notch up · Up arrow | back |
| Page up, long | F5 or Shift+F5 (slideshow) | present (never reloads); long again sends Esc = leave fullscreen |
| Page down, long | B or . (black screen) | black screen toggle |
| Hyperlink, short | Tab | pause / resume timer (Tab never moves focus) |
| Hyperlink, double | Enter | next |
| Hyperlink, long | Alt+Tab | left to Windows: switches between the slide and presenter windows |
| Laser, volume | (hardware / system volume) | nothing needed |

Implemented in `src/engine/input.js` (`resolveKey`, `bindKeys`, `bindWheel`, 121 tests). Still to wire (MAIN): `bindWheel` in both views (ignore the presenter notes panel, `[data-scrollable]`); a **clicker test** on the presenter start screen that shows each press and the action it triggered; a "clicker ready" indicator showing which deck window has keyboard focus; and **refresh safety**: the leader saves its state to `sessionStorage` on every change and restores it on load, so even an accidental reload keeps the slide, beat and timer.

---

## 12. Checkpoints: save after every finished piece

The user's words: "commit the progress ... commit after each slide is finalized. This will help in case I run out of usage." After each finished item (a diagram marked DONE, a verified photo pair, a slide's copy applied, an engine milestone), run:

`node scripts/checkpoint.mjs --message "<what was finished>"`

It commits a snapshot (src, scripts, spec, assets/img, drafts, STATUS files) to `arch-erickson/Seoul-Research` and pushes. A lock makes it safe to run from any session at any time. **The 3D and IMAGES sessions use `--no-site`** (source snapshot only). Only MAIN runs it without `--no-site`, which also rebuilds and updates the live site, but only if the deck passes a strict offline smoke test.

---

## 10. The PDF (made last, when the user asks)

The user's words: "the pdf should simply be for sending via email as a static preview which should look good without the animations." It comes from `?view=print`: every slide fully built (all beats), 3D diagrams captured at their final state, photo slides included, references appendix last, no timer overlay, one 16:9 page per slide. MAIN renders it with headless Chrome `--print-to-pdf` once everything is final and delivers it to the course folder. The presenter start screen reminds the user to submit it.
