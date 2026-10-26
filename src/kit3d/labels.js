// DOM labels (Montserrat) with SVG leaders, positioned in design px (= stage px of the region).
// Labels never carry backgrounds or halos: they must sit in clear space, which audit() verifies.
//
// Placement modes (opts.place):
//   { mode:'column', x, side:'right'|'left', dy }  label edge at x; first line centred on the anchor's
//                                                   screen y; horizontal leader from the anchor.
//   { mode:'fixed', x, y, ax, ay }                  label box anchored at (x,y) (ax: left|center|right,
//                                                   ay: top|middle|bottom); leader from anchor to the
//                                                   nearest attach point (straight, or 'v'/'h' shoulder).
//   { mode:'offset', dx, dy, ax, ay }               box relative to the projected anchor, no leader by default.
import * as THREE from 'three';
import { C, FONT, LW } from './tokens.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const TONE = { ink: C.ink, red: C.red, blue: C.blue, muted: C.muted };

export class LabelLayer {
  constructor(stage) {
    this.stage = stage;
    this.labels = [];
    const el = document.createElement('div');
    el.className = 'k3-labels';
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0;';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'k3-leaders');
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;';
    el.appendChild(svg);
    this.el = el;
    this.svg = svg;
  }
  setDesignSize(w, h) {
    this.el.style.width = w + 'px';
    this.el.style.height = h + 'px';
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  add(opts) {
    const l = new Label(this, opts);
    this.labels.push(l);
    return l;
  }
  update() { for (const l of this.labels) l.update(); }
  remeasure() { for (const l of this.labels) l.measure(); this.update(); }
  dispose() { this.el.remove(); this.labels.length = 0; }
}

const _v = new THREE.Vector3();

export class Label {
  constructor(layer, opts) {
    this.layer = layer;
    this.o = Object.assign({
      text: '', sub: null, tone: 'ink', subTone: null, leaderTone: null, size: FONT.nameSize, subSize: FONT.subSize,
      weight: FONT.nameWeight, subWeight: FONT.subWeight, caps: false, subCaps: false, align: null,
      anchor: null, anchorObj: null, place: { mode: 'offset', dx: 0, dy: 0 }, leader: null, dot: true,
      gap: 12, allow: [], name: null, lineHeight: 1.18, maxWidth: null, nowrap: true,
    }, opts);
    const o = this.o;
    if (o.leader === null) o.leader = o.place.mode === 'offset' ? false : (o.place.mode === 'column' ? 'h' : 'straight');
    const el = document.createElement('div');
    el.className = 'k3-label';
    const align = o.align || (o.place.mode === 'column' && o.place.side === 'left' ? 'right' : (o.place.ax === 'center' ? 'center' : (o.place.ax === 'right' ? 'right' : 'left')));
    el.style.cssText = `position:absolute;left:0;top:0;font-family:${FONT.family};text-align:${align};` +
      `white-space:${o.nowrap ? 'nowrap' : 'normal'};opacity:0;will-change:transform,opacity;` +
      (o.maxWidth ? `max-width:${o.maxWidth}px;` : '');
    const name = document.createElement('div');
    name.className = 'k3-name';
    name.textContent = o.text;
    name.style.cssText = `font-size:${o.size}px;font-weight:${o.weight};line-height:${o.lineHeight};color:${TONE[o.tone] || o.tone};` +
      (o.caps ? `text-transform:uppercase;letter-spacing:${FONT.capsTracking};` : 'letter-spacing:-0.005em;') +
      'font-feature-settings:"lnum" 1, "tnum" 0;';
    el.appendChild(name);
    if (o.sub) {
      const sub = document.createElement('div');
      sub.className = 'k3-sub';
      sub.textContent = o.sub;
      sub.style.cssText = `font-size:${o.subSize}px;font-weight:${o.subWeight};line-height:1.25;margin-top:3px;` +
        `color:${TONE[o.subTone || 'muted'] || o.subTone};` + (o.subCaps ? `text-transform:uppercase;letter-spacing:0.1em;` : 'letter-spacing:0.005em;');
      el.appendChild(sub);
    }
    layer.el.appendChild(el);
    this.el = el;
    this.nameEl = name;
    // leader
    const lt = TONE[o.leaderTone || (o.tone === 'ink' || o.tone === 'muted' ? 'ink' : o.tone)] || o.leaderTone;
    this.leaderColor = lt;
    if (o.leader) {
      const g = document.createElementNS(SVGNS, 'g');
      g.style.opacity = '0';
      const path = document.createElementNS(SVGNS, 'polyline');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', lt);
      path.setAttribute('stroke-opacity', lt === C.ink ? '0.55' : '0.9');
      path.setAttribute('stroke-width', String(o.leaderWidth || LW.leader));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      g.appendChild(path);
      if (o.dot) {
        const dot = document.createElementNS(SVGNS, 'circle');
        dot.setAttribute('r', String(o.dotR || 3));
        dot.setAttribute('fill', lt);
        g.appendChild(dot);
        this.dotEl = dot;
      }
      layer.svg.appendChild(g);
      this.leaderG = g;
      this.leaderEl = path;
    }
    this.opacity = 0;
    this.shift = 0;
    this.w = 0; this.h = 0; this.nameH = 0;
    this.box = null;
    this.leaderPts = null;
    this.anchorPx = null;
    this.measure();
  }
  measure() {
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    this.nameH = this.nameEl.offsetHeight;
  }
  anchorWorld() {
    const a = this.o.anchor;
    if (!a) return null;
    if (typeof a === 'function') return a(_v);
    if (a.isObject3D) {
      a.updateWorldMatrix(true, false);
      return _v.setFromMatrixPosition(a.matrixWorld);
    }
    if (a.isVector3) return _v.copy(a);
    return _v.set(a[0], a[1], a[2]);
  }
  setOpacity(v, shift = 0) {
    this.opacity = v;
    this.shift = shift;
    this.update();
  }
  get visible() { return this.opacity > 0.01; }
  update() {
    const o = this.o, st = this.layer.stage;
    const el = this.el;
    if (!this.w) this.measure();
    let ax = null, ay = null;
    const aw = this.anchorWorld();
    if (aw) { const p = st.project(aw); ax = p.x; ay = p.y; }
    this.anchorPx = ax === null ? null : { x: ax, y: ay };
    const pl = o.place;
    let x = 0, y = 0;
    const firstMid = Math.min(this.nameH, this.o.size * this.o.lineHeight) / 2;   // middle of the first line (wrapped labels too)
    let pts = null;
    if (pl.mode === 'column') {
      const yMid = (ay ?? 0) + (pl.dy || 0);
      y = yMid - firstMid;
      if (pl.side === 'left') { x = pl.x - this.w; pts = [[ax, yMid], [pl.x + o.gap, yMid]]; }
      else { x = pl.x; pts = [[ax, yMid], [pl.x - o.gap, yMid]]; }
      if (Math.abs(yMid - ay) > 0.5) pts = [[ax, ay], [ax + (pl.side === 'left' ? -1 : 1) * (pl.elbow || 0), yMid], pts[1]];
    } else if (pl.mode === 'fixed') {
      const axm = pl.ax || 'left', aym = pl.ay || 'top';
      x = axm === 'left' ? pl.x : axm === 'right' ? pl.x - this.w : pl.x - this.w / 2;
      y = aym === 'top' ? pl.y : aym === 'bottom' ? pl.y - this.h : aym === 'first' ? pl.y - firstMid : pl.y - this.h / 2;
      if (ax !== null && o.leader) {
        let tx, ty;
        if (o.leader === 'v') {
          // vertical leader into the top or bottom edge of the box
          tx = ax; ty = (ay < y) ? y - o.gap * 0.5 : y + this.h + o.gap * 0.5;
          pts = [[ax, ay], [tx, ty]];
        } else {
          const right = ax > x + this.w / 2;
          tx = right ? x + this.w + o.gap : x - o.gap;
          ty = y + firstMid;
          if (o.leader === 'h') pts = [[ax, ay], [ax + (tx - ax) * 0.0, ty], [tx, ty]];
          else if (o.leader === 'shoulder') {
            const sh = (right ? 1 : -1) * (pl.shoulder ?? 24);
            pts = [[ax, ay], [tx + sh, ty], [tx, ty]];
          } else pts = [[ax, ay], [tx, ty]];
        }
      }
    } else {
      const axm = pl.ax || 'left', aym = pl.ay || 'top';
      const bx = (ax ?? 0) + (pl.dx || 0), by = (ay ?? 0) + (pl.dy || 0);
      x = axm === 'left' ? bx : axm === 'right' ? bx - this.w : bx - this.w / 2;
      y = aym === 'top' ? by : aym === 'bottom' ? by - this.h : aym === 'first' ? by - firstMid : by - this.h / 2;
    }
    x = Math.round(x + this.shift);
    y = Math.round(y);
    this.box = { x, y, w: this.w, h: this.h };
    el.style.transform = `translate(${x}px,${y}px)`;
    el.style.opacity = String(this.opacity);
    if (this.leaderG) {
      if (pts && this.opacity > 0.001) {
        const r = pts.map(([px, py], i) => {
          // keep horizontal runs on half-pixels for a crisp 1px line
          const yy = (i > 0 && Math.abs(py - pts[i - 1][1]) < 0.01) || (i < pts.length - 1 && Math.abs(py - pts[i + 1][1]) < 0.01) ? Math.round(py) + 0.5 : py;
          return [px, yy];
        });
        if (o.place.mode === 'column') { r[r.length - 1][0] += this.shift; }
        this.leaderEl.setAttribute('points', r.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' '));
        if (this.dotEl) { this.dotEl.setAttribute('cx', r[0][0].toFixed(2)); this.dotEl.setAttribute('cy', r[0][1].toFixed(2)); }
        this.leaderG.style.opacity = String(this.opacity);
        this.leaderPts = r;
      } else {
        this.leaderG.style.opacity = '0';
        this.leaderPts = null;
      }
    }
  }
}
