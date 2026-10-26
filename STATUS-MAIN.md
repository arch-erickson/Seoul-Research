# STATUS-MAIN (deck engine)

Updated 2026-10-26 10:15 (integration pass). Every check ran headless, `--strict --offline` (like a double-clicked file, no internet).

| Deliverable | State |
|---|---|
| `src/engine/main.js` (final entry: imports `errors.js` first, then data + diagrams; `?view=audience\|presenter\|print`; boot failure shows `.deck-fail`) | DONE |
| `src/engine/audience.js` (leader: store ticked every 100 ms, stage + deck, keys + clicker wheel, sync leader + command router, screens controller for P / Shift+P / F, overlay timer only with no presenter, black/white, help, G prompt, wake lock, sessionStorage reload safety, audit hook) | DONE |
| `scripts/build.mjs` (one inline classic script, base64 Montserrat, `dist/index.html` + `dist/Seoul-Presentation.html`) | DONE |
| `slides.js`, `images.js`, `diagrams.js`, `print.js`, `audit.js`, `errors.js`, `frames.js` | DONE |
| `presenter.js`, `screens.js`, `sync.js`, `overlay-timer.js`, `presenter.css` (presenter session) | DONE, now wired to the real audience.js |
| Unit tests `state.test.mjs` + `input.test.mjs` | 121 / 121 pass |
| Build | clean: 10 3D modules, 7 Figma 2D fallbacks, 28 photos (14 pairs), web 1.99 MB, single file 14.74 MB |
| Audit `?audit=all` (3 chunks via `&auditSlides=`) on BOTH builds | ok: 0 violations over 122 slide/beat states, fontsOk true, 0 runtimeErrors, 0 blockedResources, 0 wrap mismatches |
| Two-window flow on the real single file (`.tmp/main/pv/test-flow-dist.mjs`) | sim 26/26, single screen 7/7 |
| PDF from `?view=print` (`.tmp/main/pdf/final.pdf`) | 39 pages, 1440 x 810 pt, 11.7 MB |
| Stale references (localhost, server.mjs, Present.cmd, presenter.html, print.html, TEMPORARY) | none left in src/engine, src/slides, src/styles, build/publish scripts or dist |

## Copy v2 + notes v2 pass (2026-10-26, afternoon)
| Item | State |
|---|---|
| Build applies spec/copy-v2.json by default (`--no-copy` leaves it out); presenter notes come from spec/notes-v2.json, `notesFor(key, images, override)` still appends photo credits and PHOTO NEEDED notes | DONE |
| timing.json: s17 B5 and s04 B3 reveal nothing now (cues and diagram states kept); content titles synced to the copy-v2 headlines (s01 "Seoul: The Carrot and the Stick") | DONE |
| Layout fixes for the new text: s09 strikethrough 9:32 shortened to 244 px; s18 14:79 set line break (new `afterCopy` override hook in slides.js); s20 14:162 / 14:165 one line (wrap check) | DONE |
| Credit lines in notes.js no longer use em dashes (": " separators; credit text from images.json is undashed) | DONE |
| s01 to s20 each: fully built render + `audit=1&beat=last` (strict, offline): 0 violations, fonts ok, 0 errors, 0 wrap mismatches; 0 em/en dashes in slide text and in all 39 notes; checkpoint per slide | DONE |
| Live site not republished in this pass (checkpoints used --no-site) | open |

## Notes
- Photos: the user will provide the missing ones. Pairs without a usable file show the neutral panel with caption; nothing else needed.
- The verified `dist/` is the 10:01 build. After it, the 3D session put `s05-trajectory`, `s06-reactor`, `s09-zeb` and `s17-parks` back into
  `src/diagrams/` (STATUS-3D: in progress). The next `node scripts/build.mjs` bundles them automatically; the final pass must re-audit
  s05, s06, s09 and s17.
- The 3D modules log `THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed` warnings (console.warn only, harmless).
- Figma slide text still contains em dashes (e.g. s15 banner and stat captions); the copy-v2 pass replaces it. The engine adds none.
- Red count is information only; several Figma slides exceed 2 red elements (s05, s06, s09, s15, s18 and others).

## Contract-change requests (ARCHITECTURE.md, not mine to edit)
- §0 ownership row for MAIN still lists `index.html`, `presenter.html`, `Present.cmd`, `server.mjs`; §4 says `window.open('presenter.html', ...)`
  and "Audience view (`index.html`)". The real model is one page with `?view=presenter`, opened from the same file.
