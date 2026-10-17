// child surfaces that are rounder than the surface they sit in (concentric-corner check)
import { open, sleep } from './cdp.mjs'
const [url, ...steps] = process.argv.slice(2)
const p = await open(url)
for (const s of steps) { await p.ev(s); await sleep(900) }
console.log(await p.ev(`const out=new Set(); const vis=(cs)=>cs.backgroundColor!=='rgba(0, 0, 0, 0)'||cs.backgroundImage!=='none'||parseFloat(cs.borderTopWidth)>0;
const nm=(e)=>e.tagName.toLowerCase()+'.'+(typeof e.className==='string'?e.className.split(' ').filter(x=>x&&!/press/.test(x)).slice(0,2).join('.'):'');
for(const el of document.querySelectorAll('.vf-artboard *')){const cs=getComputedStyle(el); const R=parseFloat(cs.borderTopLeftRadius); const r=el.getBoundingClientRect(); if(!R||cs.borderTopLeftRadius.includes('%')||!vis(cs)||R>=Math.min(r.width,r.height)/2-1||el.closest('.maplibregl-map')) continue;
 let a=el.parentElement; while(a&&a!==document.body){const ac=getComputedStyle(a); const Ra=parseFloat(ac.borderTopLeftRadius); if(Ra&&vis(ac)&&!ac.borderTopLeftRadius.includes('%')){const ar=a.getBoundingClientRect(); const d=Math.min(r.left-ar.left,r.top-ar.top,ar.right-r.right,ar.bottom-r.bottom); if(d>=0&&d<24&&R>Ra+0.5) out.add(nm(el)+' R'+Math.round(R)+' in '+nm(a)+' R'+Math.round(Ra)+' inset '+Math.round(d)); break} a=a.parentElement}}
return [...out].join('\\n')||'ok'`))
await p.close()
