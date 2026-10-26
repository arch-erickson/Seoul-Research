// Hand-made corrections and beat assignments layered on top of spec/slides.json (the Figma extraction).
// Owned by MAIN. Every entry says why it exists; keep this file small.

// Slides 1-4 have no Figma beat groups. timing.json describes their beats in words; this maps element ids to
// beat indexes (0 = B1). Elements not listed fall back to beat 0.
export const BEATMAP = {
  s01: {}, // one beat: everything at B1
  s02: {
    // B1 headline (both lines)
    '5:22': 0, '5:23': 0,
    // B2 SEOUL / NEW YORK headers, header rule, rows POPULATION + METRO REGION (each row brings the rule above it)
    '5:24': 1, '5:25': 1, '5:26': 1, '5:27': 1, '5:28': 1, '5:29': 1, '5:30': 1, '5:31': 1, '5:32': 1, '5:33': 1,
    // B3 row BUILDINGS' SHARE OF EMISSIONS
    '5:34': 2, '5:35': 2, '5:36': 2, '5:37': 2,
    // B4 row THE CLIMATE POLICY
    '5:38': 3, '5:39': 3, '5:40': 3, '5:41': 3,
  },
  s03: {
    // B1 headline + legend (3 rows) + donut (2D fallback of s03-donut)
    '5:49': 0, '5:50': 0, '5:51': 0, '5:52': 0, '5:53': 0, '5:54': 0,
    '5:55': 0, '5:56': 0, '5:57': 0, '5:58': 0, '5:59': 0, '5:60': 0, '5:61': 0, '5:62': 0, '5:63': 0,
    // B2 rule, 52.34 Mt CO2e, baseline caption, map (2D fallback of s03-map) + map caption
    '5:64': 1, '5:65': 1, '5:66': 1, '5:67': 1, '5:71': 1,
  },
  s04: {
    // B1 headline + the axis (s04-timeline state 1)
    '7:20': 0, '17:2': 0,
    // B2 1978 + 1993 (state 2)
    '17:3': 1, '17:4': 1, '17:5': 1, '17:6': 1, '17:7': 1, '17:8': 1, '17:9': 1, '17:10': 1,
    // B3 2002 + 2011 (state 3) + the closing line
    '17:11': 2, '17:12': 2, '17:13': 2, '17:14': 2, '17:15': 2, '17:16': 2, '17:17': 2, '17:18': 2, '7:39': 2,
  },
};

// Element patches. { remove: true } drops the element; { remove: 'fallback' } drops it only from the 2D fallback
// (it is inside a diagram region anyway); other keys overwrite spec fields; `chars` may be a function.
export const OVERRIDES = {
  s09: {
    // copy-v2 shortened 9:31 to "Private rule planned" (about 217 px, was 273 px). The red strikethrough keeps
    // the Figma overhang of about 27 px past the text end.
    '9:32': { w: 244 },
  },
  s12: {
    // Typo in the Figma text; the speaker notes say "urban openings".
    '10:67': { chars: (s) => s.replace('“hurban openings”', '“urban openings”').replace('hurban openings', 'urban openings') },
    // The two top floor plates of the Lotte drawing sit on the subline "Kohn Pedersen Fox · Sustainability as
    // equipment" (y 389-407). The diagram region starts at y 412, so only the 2D fallback is affected.
    '10:97': { remove: 'fallback' },
    '10:98': { remove: 'fallback' },
  },
  s17: {
    // "Park area per person, m² — the same city, measured two ways" wrapped at 470 px and its second line ran into
    // the lesson line at y 900. One line at 640 px clears it.
    '14:15': { fixedWidth: 640, wraps: false, lines: 1 },
  },
  s18: {
    // copy-v2 14:79 wrapped as "Planned: Hangang River Bus, self-driving / buses" (one orphan word) in its 390 px box,
    // which already reaches the right margin. A set break balances the two lines; same height.
    '14:79': { afterCopy: (t) => t.replace('River Bus, self-driving buses', 'River Bus,\nself-driving buses') },
  },
  s19: {
    // "Cheonggyecheon's evidence on road removal" wrapped at 480 px onto "No traffic collapse followed" (y 850).
    // Widened so it sits on one line like rows 01-04; the arrow column starts at x 706.
    '14:135': { fixedWidth: 506, wraps: false, lines: 1 },
  },
  s20: {
    // "Full reference list in the submitted PDF." is a citation line; locked rule: no source lines on slides.
    '14:166': { remove: true },
    // copy-v2 text is shorter than the Figma text: one line each now (the audit's wrap check expects the real count).
    '14:162': { lines: 1 },
    '14:165': { lines: 1 },
  },
};

// Colour normalisation: the Figma file uses #EDECEA one step off the faint token #EDEDEA.
export const COLOR_MAP = { '#EDECEA': '#EDEDEA' };

// Deliberate text/shape overlaps the audit must not flag: [shapeId, textId].
export const AUDIT_ALLOW = {
  // s09: the red rule through "Private mandate planned" is the strikethrough of the 2024 plan the notes point at.
  s09: [['9:32', '9:31']],
};
