// Runtime error + blocked-resource capture for the audit (?audit=1 / ?audit=all).
// Importing this module installs the listeners (module evaluation runs before any boot code in the IIFE bundle),
// so main.js should import it first. Idempotent.
//   runtimeErrors()     -> [{ msg, at }]           uncaught errors, unhandled rejections, console.error calls
//   blockedResources()  -> [{ kind, url, detail }]  elements that failed to load (img/link/script), CSP blocks,
//                                                    and font faces whose status is "error"

import './frames.js'; // ?audit / ?view=print: timer-driven frames (headless-safe), installed before any boot code

const MAX = 200;
const S = (typeof window !== 'undefined' && (window.__seoulErrors || (window.__seoulErrors = { errors: [], blocked: [], installed: false }))) || { errors: [], blocked: [], installed: true };

const short = (u) => {
  const s = String(u || '');
  return s.startsWith('data:') ? s.slice(0, 40) + '... (' + s.length + ' chars)' : s.slice(0, 300);
};
const push = (list, item) => { if (list.length < MAX) list.push(item); };

export function installErrorCapture() {
  if (S.installed || typeof window === 'undefined') return;
  S.installed = true;
  window.addEventListener('error', (e) => {
    const t = e && e.target;
    if (t && t !== window && t.nodeType === 1) {
      // resource load failure (does not bubble; seen here in the capture phase)
      push(S.blocked, { kind: (t.tagName || '').toLowerCase(), url: short(t.currentSrc || t.src || t.href), detail: 'load error' });
      return;
    }
    push(S.errors, { msg: String((e && (e.message || (e.error && e.error.message))) || 'error'), at: e && e.filename ? `${short(e.filename)}:${e.lineno || 0}:${e.colno || 0}` : '' });
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    push(S.errors, { msg: 'unhandled rejection: ' + String((r && (r.message || r)) || 'unknown'), at: (r && r.stack && String(r.stack).split('\n')[1] || '').trim() });
  });
  document.addEventListener('securitypolicyviolation', (e) => {
    push(S.blocked, { kind: 'csp', url: short(e.blockedURI), detail: e.violatedDirective || 'blocked' });
  });
  const orig = console.error;
  console.error = function (...args) {
    try {
      push(S.errors, { msg: 'console.error: ' + args.map((a) => (a && a.message) || (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ').slice(0, 400), at: '' });
    } catch { /* never break logging */ }
    return orig.apply(this, args);
  };
}

export function runtimeErrors() { return S.errors.slice(); }

export function blockedResources() {
  const out = S.blocked.slice();
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      for (const f of document.fonts) {
        if (f.status === 'error') out.push({ kind: 'font', url: `${f.family} ${f.weight} ${f.unicodeRange && f.unicodeRange.length < 40 ? f.unicodeRange : ''}`.trim(), detail: 'font face failed to load' });
      }
    }
  } catch { /* FontFaceSet iteration unsupported */ }
  return out;
}

installErrorCapture();
