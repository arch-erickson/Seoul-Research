// 2D motion markup (codex/MOTION-NOTES.md, "Exact markup assignment" and "Thin-rule inventory"), by slide key and
// Figma element id. slides.js adds data-motion="count" / "draw" to these elements when they are rendered as visible
// HTML: an element removed by copy-v2 is simply absent, and an element that is the 2D fallback of a diagram with a
// live 3D module is skipped (the diagram owns its own motion).
//
// COUNT: plain text elements count up as a whole; rich text (CO2 subscript, arrows) gets only its number wrapped.
// The parser in motion.js skips years, ranges ("to"), several numbers and words without a number.

export const COUNT = {
  s02: ['5:36', '5:40', '5:41'],
  s03: ['5:53', '5:57', '5:65'],
  s05: ['8:84', '8:85'],
  s06: ['8:371'],
  s07: ['8:493', '8:500', '8:505'],
  s08: ['8:529', '8:543'],
  s11: ['10:30'],
  s15: ['13:13', '13:16'],
  s18: ['14:60', '14:62', '14:70', '14:81'],
  s19: ['14:113', '14:122', '14:131'],
};

// DRAW: thin rules (short side <= 4 px, aspect >= 20) and the s07 progress fill 8:499 (never its track 8:498).
export const DRAW = {
  s01: ['5:12', '5:13'],
  s02: ['5:26', '5:30', '5:34', '5:38'],
  s03: ['5:64'],
  s04: ['17:2', '17:4', '17:8', '17:12', '17:16'],
  s05: ['8:79', '8:80', '8:87', '8:92', '8:96', '8:100'],
  s06: ['8:369', '8:373'],
  s07: ['8:496', '8:504', '8:499'],
  s09: ['9:18', '9:21', '9:26', '9:29', '9:32', '9:34', '9:38'],
  s10: ['12:5', '12:7', '12:8', '12:9', '12:10', '12:11', '12:12', '12:13', '12:14', '12:15', '12:16', '12:17', '12:18',
    '12:19', '12:20', '12:21', '12:22', '12:23', '12:24', '12:25', '12:26', '12:27', '12:28', '12:29', '12:30', '12:31',
    '12:32', '12:33', '12:34', '12:35', '12:36', '12:37', '12:38', '12:39', '12:63', '12:64', '12:65', '12:66', '12:69',
    '12:72', '12:75', '12:78', '12:82', '12:86', '12:90'],
  s11: ['10:28', '10:34'],
  s12: ['10:99', '10:100', '10:102', '10:104', '10:106', '10:110'],
  s13: ['12:130', '12:134'],
  s14: ['12:163', '12:164', '12:166', '12:168', '12:170', '12:176', '12:179', '12:182', '12:185'],
  s15: ['13:15', '13:18', '13:22'],
  s16: ['13:55', '13:71', '13:92', '13:115'],
  s17: ['14:14', '14:17', '14:22', '14:31'],
  s18: ['14:59', '14:66', '14:80'],
  s19: ['14:105', '14:114', '14:123', '14:132'],
  s20: ['14:156', '14:157'],
};

/** 'count' | 'draw' | null for one element of one slide. */
export function motionMark(key, id) {
  if ((COUNT[key] || []).includes(id)) return 'count';
  if ((DRAW[key] || []).includes(id)) return 'draw';
  return null;
}
