// Dev harness: mounts one diagram at its exact region on a white 1920×1080 stage.
// Query: d, state, static=1, audit=1, quality=high|preview, scale (stage CSS scale), frame=1 (region outline),
//        overlay=1 (draw audit violations), sheet=1 (all states in a grid), ctx=1 (grey placeholders for HTML around)
import CONTEXT from './context.js';
import { montserratReady } from '../src/kit3d/font.js';

function param(q, k, d) { const v = q.get(k); return v === null ? d : v; }

async function fontsReady() {
  if (!document.fonts) return;
  const loads = [];
  for (const w of [300, 400, 500, 600, 700, 800, 900]) loads.push(document.fonts.load(`${w} 20px Montserrat`, 'Ag0≈²·–'));
  try { await Promise.all(loads); await montserratReady(); await document.fonts.ready; } catch (e) {}
}

function writeAudit(obj) {
  let el = document.getElementById('audit-result');
  if (!el) { el = document.createElement('script'); el.type = 'application/json'; el.id = 'audit-result'; document.body.appendChild(el); }
  el.textContent = JSON.stringify(obj, null, 1);
}

function drawOverlay(stageEl, region, res) {
  for (const l of res.labels) {
    const b = document.createElement('div');
    b.className = 'vbox';
    b.style.cssText += `left:${region.x + l.rect.x}px;top:${region.y + l.rect.y}px;width:${l.rect.w}px;height:${l.rect.h}px;` +
      (res.violations.some(v => v.includes(`"${l.text.split(' / ')[0]}"`)) ? '' : 'outline-color:rgba(0,71,160,.6);background:rgba(0,71,160,.05);');
    stageEl.appendChild(b);
  }
}

function drawContext(stageEl, id) {
  const boxes = CONTEXT[id] || [];
  for (const c of boxes) {
    const d = document.createElement('div');
    d.className = 'ctxbox';
    d.style.cssText += `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;` + (c.font ? `font:${c.font};color:${c.color || '#111112'};background:none;justify-content:flex-start;align-items:flex-start;text-align:left;` : '');
    d.textContent = c.t || '';
    stageEl.appendChild(d);
  }
}

export async function run(diagram) {
  const q = new URLSearchParams(location.search);
  const stageEl = document.getElementById('stage');
  const scale = parseFloat(param(q, 'scale', '1'));
  const quality = param(q, 'quality', scale < 0.6 ? 'preview' : 'high');
  const isStatic = param(q, 'static', '0') === '1';
  const doAudit = param(q, 'audit', '0') === '1';
  const sheet = param(q, 'sheet', '0') === '1';
  const region = diagram.region;
  await fontsReady();
  const results = [];

  if (sheet) {
    // all states, each in its own stage-scaled cell
    const n = diagram.states + 1;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const pad = 24, capH = 34;
    const cellW = Math.floor((1920 - pad * (cols + 1)) / cols);
    const s = Math.min(cellW / region.w, ((1080 - pad) / Math.ceil(n / cols) - capH - pad) / region.h);
    stageEl.style.overflow = 'visible';
    for (let i = 0; i < n; i++) {
      const cx = pad + (i % cols) * (cellW + pad), cy = pad + Math.floor(i / cols) * (region.h * s + capH + pad);
      const cell = document.createElement('div');
      cell.className = 'region frame';
      cell.style.cssText += `left:${cx}px;top:${cy + capH}px;width:${region.w}px;height:${region.h}px;transform:scale(${s});transform-origin:0 0;`;
      stageEl.appendChild(cell);
      const cap = document.createElement('div');
      cap.className = 'sheet-cap';
      cap.style.cssText += `left:${cx}px;top:${cy}px;`;
      stageEl.appendChild(cap);
      const inst = diagram.create({ container: cell, pixelRatio: s, quality: 'high', reducedMotion: false });
      await inst.setState(i, { instant: true });
      inst.renderOnce();
      const res = inst.audit();
      results.push({ state: i, ...res });
      cap.innerHTML = `${diagram.id} · state ${i} · ` + (res.violations.length ? `<span class="bad">${res.violations.length} violation(s)</span>` : '<span class="ok">audit clean</span>');
    }
    writeAudit({ id: diagram.id, sheet: true, results });
    document.title = 'ready';
    return;
  }

  stageEl.style.transform = `scale(${scale})`;
  if (param(q, 'ctx', '0') === '1') drawContext(stageEl, diagram.id);
  const el = document.createElement('div');
  el.className = 'region' + (param(q, 'frame', '0') === '1' ? ' frame' : '');
  el.style.cssText += `left:${region.x}px;top:${region.y}px;width:${region.w}px;height:${region.h}px;`;
  stageEl.appendChild(el);
  const pr = quality === 'preview' ? scale : (window.devicePixelRatio || 1) * scale;
  const inst = diagram.create({ container: el, pixelRatio: pr, quality, reducedMotion: false });
  window.__inst = inst;
  const target = Math.min(diagram.states, parseInt(param(q, 'state', String(diagram.states)), 10));
  if (q.get('t') !== null) {
    // mid-transition frame: jump to `from` (default target-1), start the transition to `state`, freeze at t ms
    const from = parseInt(param(q, 'from', String(Math.max(0, target - 1))), 10);
    await inst.setState(from, { instant: true });
    inst.setState(target);
    inst.stage.scrub(parseFloat(q.get('t')));
  } else if (isStatic) {
    await inst.setState(target, { instant: true });
    inst.renderOnce();
  } else {
    // live: play every beat from 0 with a pause between, then hold
    const hold = parseInt(param(q, 'hold', '1600'), 10);
    for (let i = 1; i <= target; i++) {
      await new Promise(r => setTimeout(r, i === 1 ? 600 : hold));
      await inst.setState(i);
    }
  }
  if (doAudit) {
    const res = inst.audit();
    writeAudit({ id: diagram.id, state: target, ...res });
    if (param(q, 'overlay', '0') === '1') drawOverlay(stageEl, region, res);
  }
  document.title = 'ready';
}
