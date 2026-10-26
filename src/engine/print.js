// ?view=print: the static PDF the user will email ("should look good without the animations").
// Every slide fully built (all beats), one per 1920x1080 page (@page in print.css), no animation, no timer overlay,
// photo slides included, the References and Image Credits appendix last, nothing cut across pages.
// Diagrams are mounted one slide at a time, set to their final state instantly, rendered once (renderOnce), then the
// WebGL canvas is frozen into an <img> (canvas.toDataURL) with the DOM labels cloned over it, and the instance is
// disposed, so the PDF never depends on live WebGL contexts.
//
// bootPrint({ data, root }) -> Promise<{ deck, pages }>
//   data = { slidesSpec, timing, images, references, diagrams, copy? }
// When everything is laid out: <html data-print-ready="1"> and window.__seoulPrintReady === true
// (document.title stays the deck title, which becomes the PDF title).

import { buildDeck, fontsReady } from './slides.js';
import './frames.js';

// Timer yields only: a pending requestAnimationFrame stalls headless Chrome's virtual time (--print-to-pdf), and
// nothing here needs a painted frame (layout and canvas readback are synchronous).
const nextFrame = () => new Promise((r) => setTimeout(r, 0));
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

function freezeSlot(slot) {
  // Replace live canvases with images at the same box; keep the DOM labels (cloned, canvases removed).
  const snap = document.createElement('div');
  snap.className = 'snapshot-layer';
  snap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
  const slotRect = slot.getBoundingClientRect();
  const zoom = slotRect.width / (parseFloat(slot.style.width) || slotRect.width) || 1;
  let frozen = 0;
  for (const c of slot.querySelectorAll('canvas')) {
    let url = null;
    try { url = c.toDataURL('image/png'); } catch (e) { url = null; }
    if (!url || url.length < 100) continue;
    const r = c.getBoundingClientRect();
    const img = document.createElement('img');
    img.className = 'snapshot';
    img.alt = '';
    img.src = url;
    img.style.left = (r.left - slotRect.left) / zoom + 'px';
    img.style.top = (r.top - slotRect.top) / zoom + 'px';
    img.style.width = r.width / zoom + 'px';
    img.style.height = r.height / zoom + 'px';
    snap.appendChild(img);
    frozen++;
  }
  for (const node of slot.children) {
    if (node.tagName === 'CANVAS') continue;
    const clone = node.cloneNode(true);
    for (const c of clone.querySelectorAll('canvas')) c.remove();
    snap.appendChild(clone);
  }
  return { snap, frozen };
}

function statusBox() {
  const el = document.createElement('div');
  el.className = 'print-status';
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return (text) => { el.textContent = text; };
}

export async function bootPrint({ data, root = document.body } = {}) {
  if (!data || !data.slidesSpec || !data.timing) throw new Error('bootPrint: data.slidesSpec and data.timing are required');
  document.documentElement.dataset.view = 'print';
  document.body.dataset.view = 'print';
  const wrap = document.createElement('div');
  wrap.className = 'print-root';
  const stage = document.createElement('div');
  stage.className = 'stage';
  wrap.appendChild(stage);
  root.appendChild(wrap);
  const status = statusBox();
  status('Preparing slides...');

  await fontsReady();
  const deck = buildDeck(stage, { ...data, view: 'print', manageDiagrams: 'manual', reducedMotion: true, prefetch: 0 });
  // Every section visible at once (print.css), fully built.
  for (let i = 0; i < deck.count; i++) {
    deck.show(i, Infinity, { instant: true });
    deck.sections[i].classList.add('is-current');
  }
  deck.fitAppendix();

  const report = { diagrams: [], fallbacks: [] };
  for (let i = 0; i < deck.count; i++) {
    const info = deck.info(i);
    if (!info.diagrams.length) continue;
    status(`Rendering diagrams: ${info.key}`);
    deck.mountDiagrams(i);
    const ps = [];
    for (const d of info.diagrams) ps.push(deck.host.setState(d.id, d.beatStates[d.beatStates.length - 1] || 0, { instant: true, force: true }));
    await Promise.all(ps);
    await nextFrame();
    for (const d of info.diagrams) {
      if (!deck.host.isLive(d.id)) { report.fallbacks.push(d.id); continue; }
      deck.host.renderOnce(d.id); // same task as toDataURL: the drawing buffer is still intact
      const { snap, frozen } = freezeSlot(d.slot);
      deck.host.unmount(d.id);
      if (frozen) {
        d.slot.appendChild(snap);
        d.slot.classList.add('is-frozen');
        // the snapshot replaces the 2D fallback
        for (const el of info.section.querySelectorAll(`[data-fb="${d.id}"]`)) el.classList.add('fb-off');
        report.diagrams.push(d.id);
      } else {
        report.fallbacks.push(d.id); // keep the Figma 2D elements rather than an empty box
      }
    }
  }

  // Photos and snapshots fully decoded before the page is declared ready.
  status('Loading photographs...');
  const imgs = [...wrap.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
  await nextFrame();
  await settle(30);

  // On screen, fit the 1920 px pages to the window width; print.css resets the zoom when printing.
  const fitScreen = () => { stage.style.zoom = String(Math.min(1, (window.innerWidth - 32) / 1920)); };
  fitScreen();
  window.addEventListener('resize', fitScreen);
  window.addEventListener('beforeprint', () => { stage.style.zoom = '1'; });
  window.addEventListener('afterprint', fitScreen);
  status(`${deck.count} slides ready. Press Ctrl+P and choose Save as PDF (turn Background graphics on).`);
  document.documentElement.dataset.printReady = '1';
  window.__seoulPrintReady = true;
  window.__seoulPrintReport = report;
  return { deck, pages: deck.sections, report };
}
