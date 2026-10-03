/** Deterministic exposure model. Coordinates use [longitude, latitude]. */
const SEVERITY = { violent_crime: 1, sexual_assault: 1, robbery: .85, kidnapping: .95,
  assault: .75, harassment: .55, theft: .4, vandalism: .25, traffic_incident: .2, other: .3 };
const VERSION = 'exposure-2.0';
const rad = n => n * Math.PI / 180;
function haversine(lat1,lng1,lat2,lng2) {
 const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lng2-lng1)/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,a)));
}
function validPoint(p){return Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;}
function segmentDistanceKm(point,start,end){
 const scale=Math.cos(rad(point[1]));
 const x1=rad(start[0]-point[0])*6371*scale,y1=rad(start[1]-point[1])*6371;
 const x2=rad(end[0]-point[0])*6371*scale,y2=rad(end[1]-point[1])*6371;
 const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,-(x1*dx+y1*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x1+t*dx,y1+t*dy);
}
const recencyWeight=days=>Math.pow(.5,days/60);
const distanceDecay=km=>Math.exp(-(km*km)/(2*.3*.3));
const level=s=>s<.3?'LOW':s<.6?'MEDIUM':'HIGH';
function normalizeIncidents(records,now=Date.now()){
 const seen=new Set();
 return (records||[]).flatMap(r=>{
  const lat=Number(r.lat??r.latitude),lng=Number(r.lng??r.longitude);
  if(r.lat==null&&r.latitude==null||r.lng==null&&r.longitude==null||!validPoint([lng,lat]))return [];
  const days=r.days_old!=null?Number(r.days_old):(now-Date.parse(r.incident_date))/86400000;
  if(!Number.isFinite(days)||days<0||days>3650)return [];
  const id=String(r.id??`${lat}:${lng}:${r.incident_date}:${r.category}`);
  if(seen.has(id))return [];seen.add(id);
  return [{id,lat,lng,days_old:days,category:String(r.category||'other').toLowerCase().replace(/[^a-z_]/g,'_'),source:r.source||'Provided dataset',precision_meters:Number.isFinite(r.precision_meters)?Math.max(0,Math.min(100,r.precision_meters)):0}];
 });
}
function scoreRoute(records,points,corridorKm=.5,options={}){
 if(!Array.isArray(points)||points.length<2||!points.every(validPoint))throw new Error('Invalid route geometry');
 const coverage=options.coverage??'AVAILABLE',now=options.now??Date.now();
 const incidents=normalizeIncidents(records,now),evidence=new Map(),segments=[];
 let distanceTotal=0,exposureTotal=0;
 for(let i=0;i<points.length-1;i++){
  const start=points[i],end=points[i+1],distance=haversine(start[1],start[0],end[1],end[0])*1000;let weight=0;
  for(const inc of incidents){
   const d=segmentDistanceKm([inc.lng,inc.lat],start,end),nearest=Math.max(0,d-inc.precision_meters/1000);if(nearest>corridorKm)continue;
   weight+=(SEVERITY[inc.category]??.35)*recencyWeight(inc.days_old)*distanceDecay(nearest);
   const old=evidence.get(inc.id);
   if(!old||d<old.distance_km)evidence.set(inc.id,{id:inc.id,category:inc.category,days_old:Math.floor(inc.days_old),distance_km:Number(d.toFixed(3)),source:inc.source});
  }
  const s=coverage==='AVAILABLE'?Math.min(weight/10,1):0;
  segments.push({segment_id:`seg-${i}`,start_index:i,end_index:i+1,score:Number(s.toFixed(4)),risk_level:coverage==='AVAILABLE'?level(s):'UNKNOWN',distance_meters:Math.round(distance)});
  distanceTotal+=distance;exposureTotal+=s*distance;
 }
 const score=distanceTotal?exposureTotal/distanceTotal:0;
 return {score:Number(score.toFixed(4)),level:coverage==='AVAILABLE'?level(score):'UNKNOWN',incident_count:evidence.size,
  supporting_evidence:[...evidence.values()],segments,coverage,algorithm_version:VERSION,evaluated_at:new Date(now).toISOString(),
  elevated_segment_count:segments.filter(s=>s.risk_level==='HIGH'||s.risk_level==='MEDIUM').length};
}
module.exports={scoreRoute,haversine,recencyWeight,distanceDecay,segmentDistanceKm,normalizeIncidents,validPoint,VERSION};
