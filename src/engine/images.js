// Image interstitials (ARCHITECTURE.md section 7): Seoul photo left, New York photo right, each a 960x1080 panel.
// buildImageSlide(section, pair, { view }) -> [{ el, beat }]  (beat 0 = Seoul at 0:00, beat 1 = New York at 0:04)
// pair = an entry of spec/images.json { id, theme, seoul:{file,place,subject,focal,status,...}, nyc:{...} }.
// Missing manifest / file / status "user-supply" => neutral panel + caption; the userSupplyNote is for the presenter
// notes only, never on the slide.
//
// Image sources: dist/index.html loads the relative file (assets/img/iNN-*.jpg). dist/Seoul-Presentation.html carries
// every photo as a data URI in <script type="application/json" id="seoul-images"> ({ "assets/img/x.jpg": "data:..." }),
// written by scripts/build.mjs; resolveImage() prefers that map, so the single file needs nothing next to it.

const SIDES = [
  { side: 'seoul', x: 0, tone: 'red', fallbackPlace: 'SEOUL' },
  { side: 'nyc', x: 960, tone: 'blue', fallbackPlace: 'NEW YORK' },
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let inlineMap;
/** The single-file build's image map, or {} (read once). */
export function inlineImages() {
  if (inlineMap !== undefined) return inlineMap;
  inlineMap = {};
  try {
    const el = typeof document !== 'undefined' && document.getElementById('seoul-images');
    if (el) inlineMap = JSON.parse(el.textContent || '{}') || {};
  } catch (e) {
    console.error('[images] inline image map unreadable', e);
  }
  return inlineMap;
}

/** URL to load for a manifest path: the inlined data URI when present, else the relative path itself. */
export function resolveImage(file) {
  if (!file) return null;
  const key = String(file).replace(/^\.\//, '');
  const map = inlineImages();
  return map[key] || map[file] || key;
}

export function imageUsable(entry) {
  return !!(entry && entry.file && entry.status !== 'user-supply' && entry.status !== 'missing');
}

export function buildImageSlide(section, pair, { view = 'audience' } = {}) {
  section.classList.add('image-slide');
  const out = [];
  SIDES.forEach((s, beat) => {
    const entry = (pair && pair[s.side]) || {};
    const panel = document.createElement('div');
    panel.className = `el img-panel norise ${s.side}`;
    panel.dataset.beat = String(beat);
    panel.dataset.role = 'container';
    panel.style.left = s.x + 'px';
    panel.style.setProperty('--o', '1');
    panel.dataset.motionRise = '0'; // full-bleed panel: fades in without the 16 px rise (motion.js)

    if (imageUsable(entry)) {
      const img = document.createElement('img');
      img.dataset.motion = 'photo'; // slow push-in from motion.js startPhoto(panel), toward the focal point
      img.alt = `${entry.place || s.fallbackPlace} · ${entry.subject || ''}`.trim();
      img.decoding = view === 'print' ? 'sync' : 'async';
      img.loading = view === 'presenter' ? 'lazy' : 'eager';
      img.draggable = false;
      const f = entry.focal || { x: 0.5, y: 0.5 };
      const fx = Number.isFinite(f.x) ? f.x : 0.5, fy = Number.isFinite(f.y) ? f.y : 0.5;
      img.style.objectPosition = `${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%`;
      img.style.transformOrigin = img.style.objectPosition;
      img.addEventListener('error', () => { img.remove(); panel.classList.add('is-missing'); }, { once: true });
      img.src = resolveImage(entry.file);
      panel.appendChild(img);
    } else {
      panel.classList.add('is-missing');
    }

    const cap = document.createElement('div');
    cap.className = `img-cap t ${s.tone}`;
    const place = entry.place || s.fallbackPlace;
    const subject = entry.subject || '';
    cap.innerHTML = `<span class="tag">${esc(place)}</span>` + (subject ? `<span class="dot"> · </span><span class="subj">${esc(subject)}</span>` : '');
    panel.appendChild(cap);

    section.appendChild(panel);
    out.push({ el: panel, beat });
  });
  // White gutter between the two photographs.
  const gutter = document.createElement('div');
  gutter.className = 'img-gutter';
  section.appendChild(gutter);
  return out;
}
