import {validPoint,haversine,segmentDistanceKm} from './risk.js';

const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
export function validPolygon(g) {
 const ps=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:null;
 return Array.isArray(ps)&&ps.length>0&&ps.length<=50&&ps.every(p=>Array.isArray(p)&&p.length>0&&p.every(r=>{
  if(!Array.isArray(r)||r.length<4||r.length>2000||!r.every(validPoint)||JSON.stringify(r[0])!==JSON.stringify(r.at(-1)))return false;
  let area=0;for(let i=1;i<r.length;i++)area+=cross(r[i-1],r[i]);if(Math.abs(area)<1e-12)return false;
  for(let i=1;i<r.length;i++)for(let j=i+2;j<r.length;j++){
   if(i===1&&j===r.length-1)continue;
   const a=r[i-1],d=sub(r[i],a),c=r[j-1],e=sub(r[j],c),denom=cross(d,e);if(Math.abs(denom)<1e-15)continue;
   const t=cross(sub(c,a),e)/denom,u=cross(sub(c,a),d)/denom;if(t>1e-9&&t<1-1e-9&&u>1e-9&&u<1-1e-9)return false;
  }return true;
 }));
}
export function bounds(points){return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
export const overlapping=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function polygonBounds(g){return bounds((g.type==='Polygon'?[g.coordinates]:g.coordinates).flat(2));}
function inRing(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;}
export function insidePolygon(p,g){return (g.type==='Polygon'?[g.coordinates]:g.coordinates).some(rings=>!rings.some(r=>r.slice(1).some((q,i)=>segmentDistanceKm(p,r[i],q)<1e-7))&&inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r)));}
export function unionIntervals(intervals){const sorted=intervals.sort((a,b)=>a[0]-b[0]),out=[];for(const v of sorted){const last=out.at(-1);if(last&&v[0]<=last[1]+1e-9)last[1]=Math.max(last[1],v[1]);else out.push([...v]);}return out;}
export function linePolygonIntervals(a,b,g){
 const d=sub(b,a),cuts=[0,1];
 for(const ring of (g.type==='Polygon'?[g.coordinates]:g.coordinates).flat())for(let i=1;i<ring.length;i++){
  const c=ring[i-1],e=sub(ring[i],c),denom=cross(d,e);if(Math.abs(denom)<1e-15)continue;
  const t=cross(sub(c,a),e)/denom,u=cross(sub(c,a),d)/denom;
  if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
 }
 const sorted=[...new Set(cuts)].sort((x,y)=>x-y),out=[];
 for(let i=1;i<sorted.length;i++){const x=sorted[i-1],y=sorted[i];if(y-x<1e-9)continue;const t=(x+y)/2;
  if(insidePolygon([a[0]+d[0]*t,a[1]+d[1]*t],g))out.push([x,y]);
 }return unionIntervals(out);
}
export function routePolygonStretches(geometry,g){let offset=0;const out=[];
 for(let i=1;i<geometry.length;i++){const a=geometry[i-1],b=geometry[i],length=haversine(a[1],a[0],b[1],b[0])*1000;
  for(const [x,y] of linePolygonIntervals(a,b,g))out.push([offset+x*length,offset+y*length]);offset+=length;
 }return unionIntervals(out).filter(([x,y])=>y-x>.5);
}
