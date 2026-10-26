# Study guide verification

## Delivered scope

The builder reads study-v2.json, study-v2-extras.json, timing.json, copy-v2.json, notes-v2.json and the Norwii N27 table in ARCHITECTURE.md section 11 on every run. It ignores extras.runOfShow and extras.keys. Source text and numeric values are preserved, with markdown rendered only in presenter notes. A source consistency check prevents a partial refresh if an input changes during the build. One check detected a concurrent ARCHITECTURE.md edit; rerunning after it completed passed cleanly.

Current output: 815,582 bytes; 41 timing sections containing all 39 study keys; 327 nonremoved audience text elements; 60 flashcards; 100 likely questions; 25 glossary entries; 2,310 seconds of talk (38:30). References, Questions and Thank You are untimed. Q&A's five-minute allocation is kept separate from the talk schedule.

## Build and source preservation

`node scripts/build-study.mjs` completes cleanly.

`node --test codex/study/build-study.test.mjs`: 7 tests pass. These check output creation, every key and true order, accumulated timing windows, all current headlines/nonremoved copy, all research fields/sources/cautions, glossary definitions, cue/quote markup, deduplicated Say this lines, embedded fonts and classic scripts, and absence of external assets and prohibited dashes.

The first focused build test failed before implementation because scripts/build-study.mjs did not exist. The completed builder passes. `rg` search for U+2013/U+2014 in the final output returns no matches; the build and tests independently enforce that condition. No source wording or numbers were rewritten.

## Browser behavior

All checks use `node scripts/shot.mjs` with `--strict --offline`, fresh headless browser profiles and no visible windows. Desktop light, desktop dark and a true 390x844 phone viewport pass all 29 browser checks with zero runtime/resource errors. Checks cover:

- Section/copy counts, 38:30 schedule and unique IDs.
- Search matches, empty state and clear.
- Flashcard tab, flip, next, previous, Space, arrow keys and shuffle retaining every card once.
- Q&A tab, hidden/revealed answers, next-question reset, shuffle retaining every question and source-slide links.
- Complete glossary, the exact eight N27 button rows, three checklist controls and theme switching.
- Tab arrow navigation, no horizontal overflow, no prohibited dashes and loaded Montserrat faces.

## Inspected screenshots

Desktop screenshots are 1440x1080; phone screenshots are 390x844:

| View | Desktop | Phone |
| --- | --- | --- |
| Top | top-desktop.png | top-phone.png |
| Slide 8 | s08-desktop.png | s08-phone.png |
| Flashcards | flashcards-desktop.png | flashcards-phone.png |
| Q&A practice | qa-desktop.png | qa-phone.png |

Also inspected day-desktop-dark.png and qa-phone-dark.png.

Pass: brief fidelity (deck palette/type and complete requested modes), hierarchy, consistent spacing/type, original wording/data, explicit labels, readable light/dark colors, no sideways phone scrolling, no overlapping text, and usable stacked layouts. Vertical scrolling on a phone is expected; longer flashcards and answers grow rather than clipping.

## Screenshot harness limitations and fixes

Chrome's command-line window has a minimum width; `--w 390` alone can clip a wider layout. build-phone-check.mjs embeds the unmodified guide in a self-contained srcdoc viewport of exactly 390x844. The same companion script writes a 1440x1080 viewport for deep-link capture. Only verification wrappers use frames; the delivered guide has no frames or supporting files.

The native helper's direct screenshot of a top-level page scrolled about 42,000 pixels produced a blank image. An independent 42,000-pixel scroll reproduction, scroll-repro.html, produces the same blank capture, while the guide's DOM audit reports the correct target and no errors. Capturing the same guide in a fixed viewport renders the deep link correctly. The actual 390x844 and 1440x1080 views were inspected, rather than accepting the blank/clipped results. The phone wrapper also exposed a relative-history URL problem in about:srcdoc; resolving hash changes against location.href fixes it and retains direct-file navigation.

## Regeneration and final copy

Run `node scripts/build-study.mjs` from the deck folder whenever notes or specs change. This regenerates the self-contained HTML and a build report with source hashes and computed timing. Verification wrappers can then be refreshed with `node codex/study/build-phone-check.mjs`.

The final course-folder copy is made only after the build, browser checks and visual review pass; its file hash is compared to the generated HTML. scripts/build-study.mjs itself writes only inside codex/study and never publishes or edits the source specs.

Final copy confirmed: 815,582 bytes. Generated and course-folder copies have matching SHA-256 87EFD056AB78076F1181E0265A9E275C385CBE91F8B4410CFBA583D703EBF892.
