# STATUS-MAIN (deck engine)

## Engine core (engine-core session, 2026-10-26)
| Deliverable | State |
|---|---|
| `scripts/build.mjs` (diagram registry, data module, iife bundle, inline CSS + base64 Montserrat, dist/index.html + dist/Seoul-Presentation.html, atomic writes, stale cleanup) | DONE |
| `slides.js` (20 Figma slides, beats, 2D fallbacks, photo slides, References and Image Credits appendix, copy-v2 override support, not applied) | DONE |
| `images.js` (relative files on the web build, inline data-URI map in the single file) | DONE |
| `print.js` (`?view=print`, 39 pages, diagrams frozen at 2x, PDF verified headless) | DONE |
| `audit.js` + `errors.js` + `frames.js` (`?audit=1|all`, `&auditSlides=`, fontsOk, runtimeErrors, blockedResources) | DONE |
| `src/engine/main.js` | TEMPORARY test entry; the integrator replaces it (and adds audience.js) |
| Full audit (all slides x beats, strict + offline) | 1 violation, inside 3D module s07-balcony (label-label), 3D session's file |
