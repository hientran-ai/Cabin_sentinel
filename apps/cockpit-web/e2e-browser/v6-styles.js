window.__S=(()=>{
const R=(e)=>{const r=e.getBoundingClientRect();return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)}};
const q=(s)=>document.querySelector(s);
const st=(e,ps)=>{if(!e)return null;const c=getComputedStyle(e);const o={};for(const p of ps)o[p]=c[p];return o};
const role=(cls)=>{const e=q('[data-testid=cockpit] .'+cls);return e?{text:(e.textContent||'').slice(0,28),...st(e,['fontSize','lineHeight','fontWeight','fontFamily'])}:null};
const small=()=>{const out=[];for(const e of document.querySelectorAll('[data-testid=cockpit] button,[data-testid=cockpit] [role=button],[data-testid=cockpit] [role=menuitem],[data-testid=cockpit] a')){const r=e.getBoundingClientRect();if(r.width<2||r.height<2)continue;const c=getComputedStyle(e);if(c.visibility==='hidden'||c.display==='none')continue;if(r.width<55.5||r.height<55.5)out.push({label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,24),w:+r.width.toFixed(1),h:+r.height.toFixed(1)})}return out};
const layout=()=>{const sb=q('[data-testid=status-bar]'),ct=q('[data-testid=cockpit-content]'),dk=q('[data-testid=dock]');const a=R(sb),b=R(ct),c=R(dk);
 const panes=[...document.querySelectorAll('[data-pane]')].map(p=>({id:p.dataset.pane,...R(p),radius:getComputedStyle(p).borderTopLeftRadius}));
 return {viewport:[innerWidth,innerHeight],root:getComputedStyle(document.documentElement).fontSize,statusH:a.h,dockH:c.h,contentLeft:b.x,contentRight:innerWidth-(b.x+b.w),gapStatusContent:+(b.y-(a.y+a.h)).toFixed(2),gapContentDock:+(c.y-(b.y+b.h)).toFixed(2),contentH:b.h,panes,
  paneGaps:panes.slice(1).map((p,i)=>+(p.x-(panes[i].x+panes[i].w)).toFixed(2))}};
const card=()=>{const e=q('[data-testid=cabin-card-wrap]>button,[data-testid=cockpit-chip]');return e?{rect:R(e),...st(e,['backdropFilter','backgroundColor','borderTopColor','borderTopWidth','boxShadow','borderTopLeftRadius','paddingTop','paddingLeft'])}:null};
const glass=()=>{const out={};for(const cls of ['su-glass','su-glass-card','su-black']){const e=q('[data-testid=cockpit] .'+cls);out[cls]=e?st(e,['backdropFilter','backgroundColor','borderTopColor','borderTopWidth','boxShadow','borderTopLeftRadius']):null}return out};
const pad=()=>{const sc=q('[data-testid=scene-parked]');const g=q('[data-testid=status-group]');if(!sc||!g)return null;return {statusGroupLeft:+(R(g).x-R(sc).x).toFixed(2),statusGroupTop:+(R(g).y-R(sc).y).toFixed(2),sceneRadius:getComputedStyle(sc).borderTopLeftRadius}};
return {layout,roles:()=>({speed:st(q('[data-testid=speed]'),['fontSize','lineHeight','fontWeight']),clock:st(q('[data-testid=parked-clock]'),['fontSize','lineHeight','fontWeight']),title:role('t-title'),body:role('t-body'),label:role('t-label'),status:role('t-status')}),card,glass,small,pad};
})();
