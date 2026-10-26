// Chrome's command-line window has a minimum width. A srcdoc frame tests the
// actual 390 CSS pixel viewport while retaining the required shot.mjs helper.
import fs from 'node:fs';
const demo = fs.readFileSync('codex/motion-demo.html', 'utf8').replace(
  'new URLSearchParams(location.search)',
  'new URLSearchParams(location.search || parent.location.search)',
);
const srcdoc = demo.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
fs.writeFileSync('codex/motion-mobile-check.html', `<!doctype html><meta charset="utf-8"><title>390px demo verification</title><style>body{margin:0;background:#EDEDEA}iframe{display:block;width:390px;height:3750px;border:0;margin:auto}</style><iframe title="Motion demo at 390 pixels" srcdoc="${srcdoc}"></iframe><script>document.querySelector('iframe').addEventListener('load',e=>{const audit=e.target.contentDocument.getElementById('audit-result');if(audit){const result=document.createElement('script');result.id='audit-result';result.type='application/json';result.textContent=audit.textContent;document.body.appendChild(result)}})</script>`);
