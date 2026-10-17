// ROOT=<css> node audit3.mjs <url> [js steps...] → off-scale gaps, paddings, radii
import { open, sleep } from './cdp.mjs'
const [url, ...steps] = process.argv.slice(2)
const p = await open(url)
for (const s of steps) { await p.ev(s); await sleep(900) }
console.log(await p.ev(`const SP=new Set([0,1,2,4,8,12,16,20,24,32,40,48,56,64]); const RA=new Set([0,4,6,8,10,12,16,20,24]); const out={gap:{},pad:{},rad:{}};
const root=document.querySelector(${JSON.stringify(process.env.ROOT || '.vf-artboard')})||document.body;
const nm=(el)=>{const c=typeof el.className==='string'?el.className:(el.className.baseVal||''); return (c.split(' ').filter(x=>x&&x!=='vf-press'&&x!=='vd-press')[0]||el.tagName.toLowerCase())};
for(const el of root.querySelectorAll('*')){const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue; const cs=getComputedStyle(el); const k=nm(el);
 if(cs.display.includes('grid')||cs.display.includes('flex')) for(const v of [cs.columnGap,cs.rowGap].map(parseFloat)) if(v>0&&!SP.has(Math.round(v))) (out.gap[k]??=new Set()).add(Math.round(v));
 for(const v of [cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(parseFloat)) if(v>0&&!SP.has(Math.round(v))) (out.pad[k]??=new Set()).add(Math.round(v));
 const rad=parseFloat(cs.borderTopLeftRadius); if(rad>0&&!cs.borderTopLeftRadius.includes('%')&&rad<Math.min(r.width,r.height)/2-1&&!RA.has(Math.round(rad))) (out.rad[k]??=new Set()).add(Math.round(rad));}
const f=(o)=>Object.entries(o).map(([k,v])=>k+':'+[...v].join('/')).join('  '); return 'GAP '+f(out.gap)+'\\nPAD '+f(out.pad)+'\\nRAD '+f(out.rad)`))
await p.close()
