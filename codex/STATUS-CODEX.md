# CODEX motion handoff for MAIN and diagram sessions

READY FOR INTEGRATION. The user approved the latest slower motion demo and asked Codex to send this handoff to the main deck agent. Codex could not address the external Claude sessions through the available chat-messaging tools. This file is the shared-folder handoff; receipt is not confirmed.

Workspace: C:\Users\erick\AppData\Local\Temp\claude\seoul-deck

## Integration request

Read codex/MOTION-NOTES.md, especially its Latest timing policy section, and integrate src/engine/motion.js into slide transitions, beat reveals, counters and 2D charts. Coordinate animation of diagram-owned objects with the diagram session. Preserve per-beat speaker timing and the latest copy overrides. The source module and demo already implement the approved animation behavior; do not use the original faster durations from ARCHITECTURE.md.

Approved timing:

- Slide fades: 440 ms.
- Opacity and 16px rise: 900 ms; sibling staggering: 140 ms.
- 2D bars, rules, fills and line segments: 1400 ms growth along their long axis.
- Counter duration by absolute magnitude, including million/M and billion/B suffixes: below 1,000 = 1.8 s; 1,000 to below 10,000 = 2.4 s; 10,000 to below 100,000 = 3 s; 100,000 to below 1 million = 4 s; 1 million to below 10 million = 5 s; 10 million to below 100 million = 6 s; 100 million to below 1 billion = 7 s; 1 billion and above = 8 s.
- Explicit examples: 65,000 takes 3 s, 540,000 takes 4 s, 2.04M TOE takes 5 s, 10 million takes exactly 6 s, US$1.46 billion takes 8 s. Durations start after the element's stagger delay. Rounded text stays below the target until completion; final strings are exact.
- Photo push-in defaults to 20 s; an explicit durationMs remains literal, so MAIN can fit the existing 10-second interstitial schedule. Caption delay is 800 ms followed by a 900 ms fade.
- Instant/reduced-motion paths use no frames; a new beat or navigation finishes earlier motion first. Preserve rapid clicker operation, back navigation and fully built revisits. finishAll is the jump-to-end/disposal boundary.

## Important renderer seam

The current slides.js puts data-beat on flat individual elements. revealBeat expects a stable group whose direct children are the beat's elements. Follow the wrapper/containing-block and CSS-transition instructions in MOTION-NOTES.md. Retire the old .off/translate reveal for managed elements, preserve authored base transforms and --o opacity, guard asynchronous navigation with a generation token, and keep both slides displayed during a paired leaveSlide/enterSlide crossfade. Existing 3D diagram instances remain under the diagram agent's ownership.

The element-by-element count markers, progress-fill ID, thin-rule inventory, photo selectors and function call sites are all listed in MOTION-NOTES.md. Respect copy removals and active-diagram replacement; animate only visible HTML fallback elements.

## Verification and final delivery

DONE: src/engine/motion.js and src/engine/motion.test.mjs.
DONE: codex/motion-demo.html, self-contained with classic inline bundle, embedded Montserrat and photo; separate codex/motion-demo.bundle.js also provided.
DONE: node --test src/engine/motion.test.mjs: 36 tests pass.
DONE: strict offline browser audit: all 21 assertions pass, including below-target state at 5999 ms and exact 10 million at 6000 ms.
DONE: inspected codex/motion-slower-mid.png and codex/motion-slower-final.png, captured headlessly at 1920x1550.
PENDING MAIN: actual deck integration, coordination with diagrams, full offline single-file rebuild, overlap audit and navigation checks.

After integration, rebuild the single-file presentation and verify rapid forward clicking, back navigation, fully built revisits, reduced motion, preview/print paths and strict offline file playback. Review the actual slides against speaker beat timing. No runtime network, modules, workers, libraries, installations or visible test windows. Do not publish merely because this integration handoff exists; follow the user's publishing authorization in the MAIN session.

Codex edited only its assigned motion source/test files and codex folder inside the shared deck project. No npm install or git commands were used.

## Study guide delivered (2026-10-26)

DONE: scripts/build-study.mjs regenerates codex/study/Seoul-Study-Guide.html from the current study, extras, copy, notes, timing and N27 table. All 39 study keys plus untimed qa/thanks are included; 38:30 talk, 60 flashcards, 100 Q&A questions, 25 glossary terms, both themes and the day-of checklist. Source wording and numbers are preserved; obsolete extras schedule/keys are ignored.
DONE: 7 build/content tests; all 29 browser checks at desktop and true 390x844 phone size, including dark mode, with zero runtime/resource errors or sideways scrolling. Inspected top, s08, Flashcards and Q&A at both sizes. Complete HTML has zero em/en dashes. Evidence and regeneration instructions: codex/study/VERIFICATION.md.
DELIVERED: copied the self-contained page to C:\Users\erick\OneDrive\Documents\CUNY\Fall 2026\ARCH 3551- Sustainability History & Practice\Research Presentation\Seoul-Study-Guide.html; 815,582 bytes; SHA-256 87EFD056AB78076F1181E0265A9E275C385CBE91F8B4410CFBA583D703EBF892 matches the generated original. No installs, git or visible windows. If source notes/timing change, rerun the builder and refresh the course-folder copy.

WHITE BACKGROUNDS (latest user request): the study guide now uses white throughout, including study panels, photo cards, tables, practice cards, buttons and timeline segment backgrounds. Dark mode and its control were removed; old dark preferences and URLs no longer change the white appearance. Rebuilt, 7 build tests pass, all 29 desktop browser checks pass including white backgrounds, and desktop/phone screenshots were inspected. Course-folder copy updated and hash-verified.
