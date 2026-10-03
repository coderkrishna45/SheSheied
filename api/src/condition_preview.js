import {readFileSync} from 'node:fs';
import {haversine,segmentDistanceKm,validPoint} from './risk.js';
import {bounds,overlapping,polygonBounds,validPolygon,linePolygonIntervals,insidePolygon} from './geography.js';

export const DEFAULT_CONDITION_PREVIEW=JSON.parse(readFileSync(new URL('../../evidence/saltlake/conditions.preview.json',import.meta.url)));
const cell=.002, key=(x,y)=>`${x}:${y}`;
const length=(a,b)=>haversine(a[1],a[0],b[1],b[0])*1000;
const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const same=(a,b)=>Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;

// Geometry is real; every condition here is synthetic. Never writes risk/evidence,
// report coverage, environment observations or check-in segments.
export function conditionPreview(dataset,walkingData){
 if(dataset?.kind!=='SYNTHETIC_WALKING_CONDITIONS'||!validPolygon(dataset.scope?.geometry)||!Array.isArray(dataset.profiles))return routes=>routes.map(({condition_preview,...r})=>r);
 const extent=polygonBounds(dataset.scope.geometry),profiles=new Map(),grid=new Map();
 for(const p of dataset.profiles){
  if(!['LOW','MEDIUM','HIGH'].includes(p.level)||!Number.isFinite(p.score)||p.score<0||p.score>100||!Array.isArray(p.conditions)||!Array.isArray(p.road_classes))continue;
  for(const cls of p.road_classes)profiles.set(cls,p);
 }
 const zones=(dataset.zones||[]).filter(z=>validPolygon(z.geometry)&&dataset.profiles.some(p=>p.id===z.profile_id));
 for(const road of walkingData.roads||[]){
  const profile=profiles.get(road.tags?.highway);if(!profile||!road.geometry?.every(validPoint))continue;
  for(let i=1;i<road.geometry.length;i++){
   const a=road.geometry[i-1],b=road.geometry[i],box=bounds([a,b]);if(!overlapping(box,extent)||length(a,b)<.5)continue;
   const edge={a,b,profile};
   for(let x=Math.floor((box[0]-.00025)/cell);x<=Math.floor((box[2]+.00025)/cell);x++)for(let y=Math.floor((box[1]-.00025)/cell);y<=Math.floor((box[3]+.00025)/cell);y++){
    const k=key(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(edge);
   }
  }
 }
 function match(a,b){
  const mid=interpolate(a,b,.5),cos=Math.cos(mid[1]*Math.PI/180),dx=(b[0]-a[0])*cos,dy=b[1]-a[1],norm=Math.hypot(dx,dy),candidates=[];
  if(!norm)return null;
  for(const e of grid.get(key(Math.floor(mid[0]/cell),Math.floor(mid[1]/cell)))||[]){
   const ex=(e.b[0]-e.a[0])*cos,ey=e.b[1]-e.a[1],alignment=Math.abs(dx*ex+dy*ey)/(norm*Math.hypot(ex,ey));
   if(alignment<.9)continue;
   const distance=Math.max(...[a,mid,b].map(p=>segmentDistanceKm(p,e.a,e.b)*1000));
   if(distance<=20)candidates.push({profile:e.profile,distance});
  }
  candidates.sort((x,y)=>x.distance-y.distance);const best=candidates[0];
  if(!best||candidates.some(c=>c.profile.id!==best.profile.id&&c.distance<=best.distance+2))return null;
  return best.profile;
 }
 function assess(route){
  const {condition_preview:old,...r}=route;
  if(r.is_demo_data||!r.geometry?.every(validPoint)||r.geometry.length<2)return r;
  const totals={LOW:0,MEDIUM:0,HIGH:0,UNKNOWN:0},stretches=[],profileMeters=new Map();let total=0,inside=0,weighted=0;
  function add(a,b,p){
   const meters=length(a,b);if(meters<.001)return;const level=p?.level||'UNKNOWN';totals[level]+=meters;
   if(p){profileMeters.set(p.id,(profileMeters.get(p.id)||0)+meters);weighted+=meters*p.score;}
   const last=stretches.at(-1);
   if(last?.level===level&&same(last.geometry.at(-1),a)){last.geometry.push(b);last.distance_meters+=meters;}
   else stretches.push({level,distance_meters:meters,geometry:[a,b]});
  }
  for(let i=1;i<r.geometry.length;i++){
   const a=r.geometry[i-1],b=r.geometry[i],meters=length(a,b);total+=meters;
   // Split before map matching so sparse provider geometry and clipped boundaries
   // cannot paint an entire long road with a single midpoint classification.
   const parts=Math.max(1,Math.ceil(meters/10));
   for(let j=0;j<parts;j++){
    const x=interpolate(a,b,j/parts),y=interpolate(a,b,(j+1)/parts),intervals=linePolygonIntervals(x,y,dataset.scope.geometry);let end=0;
    for(const [from,to] of intervals){
     if(from>end)add(interpolate(x,y,end),interpolate(x,y,from),null);
     const start=interpolate(x,y,from),finish=interpolate(x,y,to);inside+=length(start,finish);
     const cuts=[0,1,...zones.flatMap(z=>linePolygonIntervals(start,finish,z.geometry).flat())].sort((a,b)=>a-b);
     for(let k=1;k<cuts.length;k++){
      if(cuts[k]-cuts[k-1]<1e-9)continue;
      const u=interpolate(start,finish,cuts[k-1]),v=interpolate(start,finish,cuts[k]),base=match(u,v);
      const p=base?zones.filter(z=>insidePolygon(interpolate(u,v,.5),z.geometry)).map(z=>dataset.profiles.find(p=>p.id===z.profile_id)).concat(base).sort((a,b)=>b.score-a.score)[0]:null;
      add(u,v,p);
     }
     end=to;
    }
    if(end<1)add(interpolate(x,y,end),y,null);
   }
  }
  if(inside<1||!total)return r;
  const known=Math.max(0,total-totals.UNKNOWN),coverage=Math.min(100,Math.max(0,Math.floor(known/total*100+1e-7))),score=known?weighted/known:null;
  // A sizeable exposed stretch must stay visible even when averaged together
  // with a long supportive approach. These thresholds describe the scenario only.
  const level=coverage<85?'UNKNOWN':totals.HIGH>=150||score>=60?'HIGH':totals.MEDIUM>=150||totals.HIGH>=50||score>=32?'MEDIUM':'LOW';
  const labels={LOW:'More supportive',MEDIUM:'Mixed conditions',HIGH:'More exposed',UNKNOWN:'Preview coverage incomplete'};
  return {...r,condition_preview:{kind:dataset.kind,version:dataset.version,disclosure:dataset.disclosure,scope:dataset.scope.name,
   level,label:labels[level],score:score===null?null:Math.round(score),coverage_percent:coverage,
   summary:{lower_exposure_meters:Math.round(totals.LOW),mixed_meters:Math.round(totals.MEDIUM),caution_meters:Math.round(totals.HIGH),unknown_meters:Math.round(totals.UNKNOWN)},
   reasons:dataset.profiles.filter(p=>profileMeters.has(p.id)).map(p=>({level:p.level,meters:Math.round(profileMeters.get(p.id)),conditions:p.conditions})).sort((a,b)=>b.meters-a.meters),
   stretches:stretches.map(s=>({...s,distance_meters:Math.round(s.distance_meters)})),recommended:false,comparison_available:false,
   limitations:'Illustrative conditions, not field observations or crime probabilities. Green is a lower-exposure scenario, not a safety guarantee. GPS and contact alerts remain live.'}};
 }
 return (routes,maxExtraMinutes=5)=>{
  const result=routes.map(assess);
  if(result.length<2||result.some(r=>!r.condition_preview||r.condition_preview.level==='UNKNOWN'))return result;
  const fastest=Math.min(...result.map(r=>r.duration_seconds));
  const eligible=result.filter(r=>r.duration_seconds-fastest<=maxExtraMinutes*60&&(r.environment?.summary?.restricted_meters||0)===0);
  if(!eligible.length)return result;
  const burden=r=>r.condition_preview.summary.caution_meters*.85+r.condition_preview.summary.mixed_meters*.5+r.condition_preview.summary.lower_exposure_meters*.15+r.condition_preview.summary.unknown_meters;
  eligible.sort((a,b)=>burden(a)-burden(b)||a.duration_seconds-b.duration_seconds||a.route_id.localeCompare(b.route_id));
  const best=eligible[0],quickest=eligible.reduce((a,b)=>a.duration_seconds<=b.duration_seconds?a:b),saving=burden(quickest)-burden(best),choice=saving>=30?best:quickest;
  for(const r of result){r.condition_preview.comparison_available=true;r.condition_preview.recommended=r===choice;
   if(r===choice)r.condition_preview.recommendation_reason=saving>=30?`Less exposure in the sample conditions, within ${maxExtraMinutes} extra walking minutes.`:'Similar sample exposure; choose the shorter walk.';
  }
  return result;
 };
}
