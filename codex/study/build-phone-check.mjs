// Capture a real 390x844 CSS viewport despite Chrome's CLI minimum window size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here,'Seoul-Study-Guide.html'),'utf8').replace(
  '<script id="study-data"',
  '<script>window.__STUDY_CAPTURE_QUERY__=__QUERY_VALUE__;</script><script id="study-data"',
);
const source = JSON.stringify(page).replaceAll('<','\\u003c');
for (const [width,height,name] of [[390,844,'phone-check'],[1440,1080,'desktop-check']]) {
  const wrapper = `<!doctype html><meta charset="utf-8"><title>Study guide: ${width}px check</title><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:white}iframe{display:block;border:0;width:${width}px;height:${height}px}</style><script>addEventListener('message',e=>{if(e.data?.type==='seoul-study-audit'){const out=document.createElement('script');out.id='audit-result';out.type='application/json';out.textContent=JSON.stringify(e.data.report);document.body.appendChild(out)}})</script><iframe title="Study guide at a ${width} by ${height} pixel viewport"></iframe><script>document.querySelector('iframe').srcdoc=(${source}).replace('__QUERY_VALUE__',JSON.stringify(location.search));</script>`;
  fs.writeFileSync(path.join(here,name+'.html'),wrapper);
  console.log('Built codex/study/'+name+'.html with a true '+width+'x'+height+' viewport.');
}
