// Design tokens shared by every 3D diagram. Values mirror ARCHITECTURE.md §1 and §6.

export const C = {
  paper: '#FFFFFF',
  ink: '#111112',
  muted: '#6B6D70',
  rule: '#DBDAD7',
  faint: '#EDEDEA',
  red: '#CD2E3A',
  blue: '#0047A0',
  // model palette (white architectural study model)
  model: '#FFFFFF',      // white mass (user: faces white, sides only very light greys)
  modelCut: '#EFEEEB',   // section-cut faces (poché), a very light grey
  outline: '#C8C7C3',    // light-grey map outlines
  edge: '#111112',       // silhouette ink
  crease: '#5C5D60',     // interior edge ink (softer than silhouette)
  hair: '#8E8F92',       // hairline detail
  redDeep: '#8F1C26',    // edge ink on red parts
  blueDeep: '#00316F',   // edge ink on blue parts
};

// Screen-space line weights in stage px at 1080p (ARCHITECTURE.md §6).
export const LW = {
  silhouette: 1.6,
  crease: 0.9,
  hair: 0.6,
  leader: 1,
};

export const FONT = {
  family: "'Montserrat K3', 'Montserrat', sans-serif",   // embedded copy first (src/kit3d/font.js)
  nameSize: 22,
  nameWeight: 600,
  subSize: 16,
  subWeight: 500,
  capsTracking: '0.12em',
};

// Motion language: arrivals ease-out, departures ease-in, internal ease-in-out; 400–1200 ms; stagger 60–90 ms.
export const MOTION = {
  short: 450,
  base: 800,
  long: 1100,
  stagger: 75,
  labelDelay: 120,
};
