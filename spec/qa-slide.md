# Queued request: Questions + Thank You slides (build right after the Phase B workflow finishes)

The user's words: "add a question slide after the References Slides and a 5 minute timer for questions, and a centered Bold text "Thank You" and below that add "instagram: erickson_architecture" under it." Then: "the question slide should just be bold "Questions?"". The user confirmed the layout: Questions?, then Thank You.

Two new slides at the very end, after the References and Image Credits appendix (`refs`):

1. **`qa`, kind `qa`**: only a centered bold **Questions?** (Montserrat 900, large, ink #111112) and a minimal 5-minute countdown (Montserrat, small, centered below). The countdown starts when the slide is entered, pauses and resumes with the existing timer controls (Tab / T), turns red in the last 30 seconds, and shows 0:00 when done (no sound, no auto-advance). The presenter view shows the same countdown. Notes: two reminder bullets (repeat each question so the room hears it; the discussion prompts are in the study guide).
2. **`thanks`, kind `closing`**, the last slide: centered bold **Thank You** (Montserrat 900, large) with exactly `instagram: erickson_architecture` under it (Montserrat 500, muted #6B6D70). Untimed, no other text.

- The Q&A time is separate from the 38:30 talk: the talk total and the "ahead/behind" figure exclude both slides.
- No dashes anywhere.
- Include both in the static PDF as the final two pages (the PDF goes from 39 to 41 pages); the countdown doesn't appear in the PDF.
- Then rebuild, verify both slides and the countdown with `--strict --offline`, checkpoint, publish.
