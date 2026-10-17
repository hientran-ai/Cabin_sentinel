import { open, sleep } from './cdp.mjs'
const [url, ...steps] = process.argv.slice(2)
const p = await open(url)
for (const s of steps) { await p.ev(s); await sleep(900) }
console.log(await p.ev(`const SP=new Set([0,1,2,4,8,12,16,20,24,32,40,48,56,64,96]); const RA=new Set([0,4,6,8,10,12,16,20,24]); const seen=new Set(); const out=[];
const path=(el)=>{const a=[]; let e=el; for(let i=0;i<3&&e;i++){const c=typeof e.className==='string'?e.className.split(' ').filter(Boolean).slice(0,2).join('.'):''; a.unshift(e.tagName.toLowerCase()+(c?'.'+c:'')); e=e.parentElement} return a.join(' > ')};
for(const el of document.querySelectorAll('.vf-artboard *')){const r=el.getBoundingClientRect(); if(!r.width) continue; const cs=getComputedStyle(el); if(el.closest('.maplibregl-map,.cx-charger-marker')) continue;
 const bad=[]; if(cs.display.includes('grid')||cs.display.includes('flex')) for(const v of [cs.columnGap,cs.rowGap].map(parseFloat)) if(v>0&&!SP.has(Math.round(v))) bad.push('gap'+Math.round(v));
 for(const v of [cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(parseFloat)) if(v>0&&!SP.has(Math.round(v))) bad.push('pad'+Math.round(v));
 const rad=parseFloat(cs.borderTopLeftRadius); if(rad>0&&!cs.borderTopLeftRadius.includes('%')&&rad<Math.min(r.width,r.height)/2-1&&!RA.has(Math.round(rad))) bad.push('rad'+Math.round(rad));
 if(bad.length){const k=path(el)+' '+[...new Set(bad)].join(','); if(!seen.has(k)){seen.add(k); out.push(k)}}}
return out.slice(0,40).join('\\n')`))
await p.close()
