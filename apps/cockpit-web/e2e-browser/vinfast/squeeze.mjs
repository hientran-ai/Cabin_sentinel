// any control whose icon or text got squeezed (svg < 12 px wide, or text overflowing its button)
import { open, sleep } from './cdp.mjs'
const [url, ...steps] = process.argv.slice(2)
const p = await open(url)
for (const s of steps) { await p.ev(s); await sleep(900) }
console.log(await p.ev(`const bad=[]; for(const b of document.querySelectorAll('.vf-artboard button')){const r=b.getBoundingClientRect(); if(!r.width) continue;
 for(const s of b.querySelectorAll('svg')){const w=s.getBoundingClientRect().width; if(w>0&&w<12) bad.push('svg '+w.toFixed(0)+' in '+(b.getAttribute('aria-label')||b.innerText.slice(0,20)))}
 if(b.scrollWidth>b.clientWidth+2) bad.push('overflow '+(b.getAttribute('aria-label')||b.innerText.slice(0,24))+' '+b.scrollWidth+'>'+b.clientWidth)}
return bad.join('\\n')||'ok'`))
await p.close()
