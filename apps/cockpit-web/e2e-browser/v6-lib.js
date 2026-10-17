window.__M=(()=>{
const T=()=>window.__three,car=()=>window.__car;
const mul=(m,v)=>{const e=m.elements;return [e[0]*v[0]+e[4]*v[1]+e[8]*v[2]+e[12]*v[3],e[1]*v[0]+e[5]*v[1]+e[9]*v[2]+e[13]*v[3],e[2]*v[0]+e[6]*v[1]+e[10]*v[2]+e[14]*v[3],e[3]*v[0]+e[7]*v[1]+e[11]*v[2]+e[15]*v[3]]};
const cv=()=>document.querySelector('[data-testid=scene-parked] canvas')||document.querySelector('[data-testid=cockpit] canvas');
const proj=(p,w=1)=>{const cam=T().camera;cam.updateMatrixWorld();const v=mul(cam.matrixWorldInverse,[p[0],p[1],p[2],w]);const c=mul(cam.projectionMatrix,v);return [(c[0]/c[3]+1)/2,(1-c[1]/c[3])/2]};
const verts=(obj,stride=1)=>{obj.updateMatrixWorld(true);const out=[];obj.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry){const p=o.geometry.getAttribute('position');if(!p)return;const e=o.matrixWorld.elements;for(let i=0;i<p.count;i+=stride){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);out.push([e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]])}}});return out};
const wheels=()=>{const c=car();const ys=[],cx=[],cz=[];for(const n of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']){const w=c.getObjectByName(n);if(!w)continue;const v=verts(w);let y=1e9,x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of v){y=Math.min(y,p[1]);x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[2]);z1=Math.max(z1,p[2])}ys.push(y);cx.push((x0+x1)/2);cz.push((z0+z1)/2)}const m=a=>a.reduce((s,n)=>s+n,0)/a.length;return {ys,cx:m(cx),cz:m(cz)}};
const carL=()=>{const v=verts(car(),3);let a=1e9,b=-1e9;for(const p of v){a=Math.min(a,p[0]);b=Math.max(b,p[0])}return b-a};
const bounds=()=>{const v=verts(car(),2);let l=1e9,r=-1e9,t=1e9,b=-1e9;for(const p of v){const s=proj(p);l=Math.min(l,s[0]);r=Math.max(r,s[0]);t=Math.min(t,s[1]);b=Math.max(b,s[1])}return {left:l,right:r,top:t,bottom:b,width:r-l}};
const horizon=()=>{const cam=T().camera;const d=new cam.position.constructor();cam.getWorldDirection(d);const n=Math.hypot(d.x,d.z);return proj([d.x/n,0,d.z/n],0)[1]};
const rectOf=(el)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
const gapRects=(a,b)=>{const dx=Math.max(0,b.x-(a.x+a.w),a.x-(b.x+b.w)),dy=Math.max(0,b.y-(a.y+a.h),a.y-(b.y+b.h));return Math.hypot(dx,dy)};
const gapVerts=(c,card)=>{if(!card)return null;let best=1e9;for(const p of verts(car(),1)){const s=proj(p);const x=c.x+s[0]*c.w,y=c.y+s[1]*c.h;const dx=Math.max(0,card.x-x,x-(card.x+card.w)),dy=Math.max(0,card.y-y,y-(card.y+card.h));best=Math.min(best,Math.hypot(dx,dy))}return best};
const snap=()=>{const c=rectOf(cv());const w=wheels();const bd=bounds();const fp=proj([w.cx,0,w.cz]);const L=carL();
 const px={x:c.x+bd.left*c.w,y:c.y+bd.top*c.h,w:bd.width*c.w,h:(bd.bottom-bd.top)*c.h};
 const scene=rectOf(document.querySelector('[data-testid=scene-parked]')||cv().parentElement);
 const cardEl=document.querySelector('[data-testid=cabin-card-wrap]');const card=cardEl?rectOf(cardEl):null;
 return {viewport:[innerWidth,innerHeight],canvas:c,L:+L.toFixed(4),bounds:bd,carPx:px,footprint:fp,horizon:horizon(),
  wheelMinY:ys=>0,minYabs:Math.max(...w.ys.map(Math.abs)),wheelCentre:[w.cx,w.cz],
  gapCard:card?gapRects(px,card):null,gapCardVerts:gapVerts(c,card),card,gapLeft:px.x-scene.x,gapRight:scene.x+scene.w-(px.x+px.w),gapTop:px.y-scene.y,gapBottom:scene.y+scene.h-(px.y+px.h),scene}};
return {proj,verts,wheels,carL,bounds,horizon,snap,cv,rectOf};
})();
