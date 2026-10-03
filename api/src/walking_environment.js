import {getPosition} from 'suncalc';
import OpeningHours from 'opening_hours';
import {validPoint,haversine,segmentDistanceKm} from './risk.js';
import {bounds,overlapping,polygonBounds,validPolygon,routePolygonStretches} from './geography.js';
import {matchesStreet} from './street_evidence.js';

const DAY=86400000,cell=.001,roadKinds=new Set(['residential','living_street','service','pedestrian','footway','path','steps','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','track']);
const key=p=>`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`;
const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const sourceURL=s=>{try{const u=new URL(s);return u.protocol==='https:'&&u.hostname==='www.openstreetmap.org'&&!u.username&&!u.password;}catch{return false;}};
const meters=(a,b)=>haversine(a[1],a[0],b[1],b[0])*1000;
const direction=(a,b)=>{const x=(b[0]-a[0])*Math.cos(a[1]*Math.PI/180),y=b[1]-a[1],d=Math.hypot(x,y)||1;return [x/d,y/d];};
const norm=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
export function loadWalkingData(input,now=Date.now()) {
 const out={version:null,collected_at:null,roads:[],places:[],areas:[],report_areas:[],grid:new Map(),graph:new Map(),nodes:new Map(),audit:{roads:0,places:0,areas:0,rejected:0},limitations:'Walking map information unavailable.'};
 if(input?.schema_version!==1||typeof input.version!=='string'||!date(input.collected_at)||Date.parse(input.collected_at)>now+5000||input.license!=='ODbL-1.0')return out;
 out.version=input.version;out.collected_at=input.collected_at;out.limitations=String(input.limitations||'Community map facts; current street conditions are unknown.').slice(0,1200);
 const blocked=new Set(input.blocked_node_ids||[]),ids=new Set();
 for(const r of Array.isArray(input.roads)?input.roads.slice(0,20000):[]){
  if(!r||ids.has(r.id)||!/^way\/\d+$/.test(r.id)||!sourceURL(r.source_url)||!date(r.updated_at)||Date.parse(r.updated_at)>now||!Array.isArray(r.geometry)||r.geometry.length<2||r.geometry.length>5000||!r.geometry.every(validPoint)||!Array.isArray(r.node_ids)||r.node_ids.length!==r.geometry.length||!r.tags||typeof r.tags.highway!=='string'){out.audit.rejected++;continue;}
  ids.add(r.id);out.roads.push(r);
  for(let i=1;i<r.geometry.length;i++){
   const a=r.geometry[i-1],b=r.geometry[i],box=bounds([a,b]),edge={road:r,a,b,from:r.node_ids[i-1],to:r.node_ids[i]};
   const low=box.slice(0,2).map(v=>Math.floor(v/cell)),high=box.slice(2).map(v=>Math.floor(v/cell));
   if((high[0]-low[0]+1)*(high[1]-low[1]+1)>1000)continue;
   for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++){const k=`${x},${y}`;if(!out.grid.has(k))out.grid.set(k,[]);out.grid.get(k).push(edge);}
   if(!roadKinds.has(r.tags.highway)||['no','private'].includes(r.tags.access)||r.tags.foot==='no'||['yes','true'].includes(r.tags.bridge)||['yes','true'].includes(r.tags.tunnel)||r.tags.layer&&r.tags.layer!=='0'||blocked.has(edge.from)||blocked.has(edge.to))continue;
   const len=meters(a,b);if(!(len>0))continue;
   out.nodes.set(edge.from,a);out.nodes.set(edge.to,b);
   for(const [u,v] of [[edge.from,edge.to],[edge.to,edge.from]]){if(!out.graph.has(u))out.graph.set(u,[]);out.graph.get(u).push({to:v,length:len});}
  }
 }
 ids.clear();
 for(const p of Array.isArray(input.places)?input.places.slice(0,5000):[]){
  if(!p||ids.has(p.id)||!sourceURL(p.source_url)||!/^((node)|(way))\/\d+$/.test(p.id)||typeof p.name!=='string'||!validPoint(p.point)||!date(p.updated_at)||Date.parse(p.updated_at)>now||['private','no'].includes(p.tags?.access)){out.audit.rejected++;continue;}
  const allowed=new Set(['police','hospital','clinic','pharmacy','restaurant','cafe','fast_food','fuel','library','community_centre','convenience','supermarket','chemist']);
  if(!allowed.has(p.tags?.amenity||p.tags?.shop)){out.audit.rejected++;continue;}
  ids.add(p.id);
  const duplicate=out.places.find(v=>norm(v.name)===norm(p.name)&&meters(v.point,p.point)<40);
  if(duplicate){if(p.entrance_status==='MAPPED_ENTRANCE'&&duplicate.entrance_status!=='MAPPED_ENTRANCE')out.places.splice(out.places.indexOf(duplicate),1);else continue;}
  out.places.push({...p,name:p.name.slice(0,160),connected_node:p.entrance_node_id&&out.graph.has(p.entrance_node_id)?p.entrance_node_id:null});
 }
 ids.clear();
 for(const a of Array.isArray(input.areas)?input.areas.slice(0,5000):[]){
  if(!a||ids.has(a.id)||!sourceURL(a.source_url)||!validPolygon(a.geometry)){out.audit.rejected++;continue;}
  ids.add(a.id);out.areas.push({...a,_bounds:polygonBounds(a.geometry)});
 }
 for(const a of input.report_areas||[])if(ids.has(a.area_id)&&Array.isArray(a.event_ids)&&a.event_ids.length&&a.relation==='NAMED_AREA_CONTEXT'&&typeof a.method==='string'&&a.association_source_url?.startsWith('https://'))out.report_areas.push(a);
 out.audit.roads=out.roads.length;out.audit.places=out.places.length;out.audit.areas=out.areas.length;
 return out;
}
function candidates(data,p){const [x,y]=key(p).split(',').map(Number),out=new Set();for(let u=x-1;u<=x+1;u++)for(let v=y-1;v<=y+1;v++)for(const e of data.grid.get(`${u},${v}`)||[])out.add(e);return [...out];}
export function matchMapEdge(data,a,b,names=[]){
 const p=[(a[0]+b[0])/2,(a[1]+b[1])/2],dir=direction(a,b);
 const found=candidates(data,p).filter(e=>{
  const t=e.road.tags;if(['yes','true'].includes(t.bridge)||['yes','true'].includes(t.tunnel)||t.layer&&t.layer!=='0')return false;
  const d=direction(e.a,e.b);if(Math.abs(dir[0]*d[0]+dir[1]*d[1])<.94)return false;
  if(t.name&&names.some(Boolean)&&!names.some(n=>norm(n)===norm(t.name)))return false;
  return [a,p,b].every(q=>segmentDistanceKm(q,e.a,e.b)*1000<=8);
 }).map(e=>({...e,distance:segmentDistanceKm(p,e.a,e.b)*1000})).sort((a,b)=>a.distance-b.distance);
 if(!found.length)return null;
 if(found[1]&&found[0].road.id!==found[1].road.id&&Math.abs(found[1].distance-found[0].distance)<3)return null;
 return found[0];
}
export function lightPhase(point,at){const altitude=getPosition(new Date(at),point[1],point[0]).altitude;return altitude>0?'DAYLIGHT':altitude> -6?'TWILIGHT':'AFTER_DARK';}
function indiaDate(at){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'}).formatToParts(new Date(at)).map(p=>[p.type,p.value]));return new Date(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}
export function listedHours(value,point,at){
 if(typeof value!=='string'||!value.trim()||value.length>300)return 'UNKNOWN';
 // Wall-clock evaluation avoids depending on the API host timezone. Solar/holiday schedules need richer operator data.
 if(/\b(PH|SH|sunrise|sunset|dawn|dusk|week)\b/.test(value))return 'UNKNOWN';
 try{const h=new OpeningHours(value,null,{tag_key:'opening_hours'});if(!h.isWeekStable()||h.getUnknown(indiaDate(at)))return 'UNKNOWN';
  return h.getState(indiaDate(at))&&h.getState(indiaDate(at+10*60000))?'LISTED_OPEN':h.getState(indiaDate(at))?'CLOSING_SOON':'LISTED_CLOSED';
 }catch{return 'UNKNOWN';}
}
function shortPaths(data,start,maxDistance=400){
 const dist=new Map([[start,0]]),queue=[[0,start]];
 while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const [d,u]=queue.pop();if(d!==dist.get(u)||d>maxDistance)continue;
  for(const e of data.graph.get(u)||[]){const next=d+e.length;if(next<=maxDistance&&next<(dist.get(e.to)??Infinity)){dist.set(e.to,next);queue.push([next,e.to]);}}
 }return dist;
}
function publicPlace(p,at,distance){return {id:p.id,name:p.name,point:p.point,category:p.tags.amenity||p.tags.shop,source_url:p.source_url,map_updated_at:p.updated_at,opening_hours:p.tags.opening_hours||null,hours_status:listedHours(p.tags.opening_hours,p.point,at),entrance_status:p.entrance_status,straight_distance_meters:Math.round(distance),assistance_status:'UNCONFIRMED',connection_status:p.connected_node?'MAPPED_CONNECTION':'UNCONFIRMED',estimated_arrival_at:new Date(at).toISOString()};}
export function nearbyPlaces(data,origin,at=Date.now()) {
 return data.places.map(p=>({p,d:meters(origin,p.point)})).filter(v=>v.d<=800).sort((a,b)=>a.d-b.d).slice(0,8).map(({p,d})=>publicPlace(p,at+d/1.2*1000,d));
}
export function enrichWalkingRoute(route,data,incidents,departureAt=Date.now()) {
 const stale=!data.collected_at||departureAt-Date.parse(data.collected_at)>30*DAY;
 const summary={mapped_meters:0,lighting_known_meters:0,mapped_lit_meters:0,mapped_unlit_meters:0,current_lighting_meters:0,walkway_known_meters:0,mapped_walkway_meters:0,restricted_meters:0,unknown_lighting_meters:0,longest_facility_gap_meters:0};
 const stretches=[],facilities=new Map(),routeBox=bounds(route.geometry),areaReports=[];
 const reports=new Map([...(incidents?.context||[]),...(incidents?.incidents||[])].map(r=>[r.id,r]));
 for(const assoc of data.report_areas){const area=data.areas.find(a=>a.id===assoc.area_id);if(!area||!overlapping(routeBox,area._bounds))continue;
  const sections=routePolygonStretches(route.geometry,area.geometry);if(!sections.length)continue;
  const events=assoc.event_ids.map(id=>reports.get(id)).filter(Boolean);if(!events.length)continue;
  areaReports.push({id:assoc.id,name:area.name,geometry:area.geometry,event_ids:events.map(r=>r.id),historical:events.every(r=>departureAt-Date.parse(r.occurred.start)>365*DAY),source_url:area.source_url,association_source_url:assoc.association_source_url,relation:'NAMED_AREA_CONTEXT',location_reason:assoc.method,intersection_meters:Math.round(sections.reduce((n,[a,b])=>n+b-a,0)),stretches:sections.map(([a,b])=>({from_meters:Math.round(a),to_meters:Math.round(b)}))});
 }
 const surroundings=data.areas.filter(a=>overlapping(routeBox,a._bounds)&&['wood','water','wetland'].includes(a.tags?.natural)||overlapping(routeBox,a._bounds)&&['forest','industrial','construction','residential'].includes(a.tags?.landuse)||overlapping(routeBox,a._bounds)&&a.tags?.leisure==='park').map(a=>({id:a.id,name:a.name,kind:a.tags.natural||a.tags.landuse||a.tags.leisure,source_url:a.source_url,stretches:routePolygonStretches(route.geometry,a.geometry)})).filter(a=>a.stretches.length).slice(0,20);
 let offset=0,gap=0,longest=0,validUntil=departureAt+15*60000;
 const pathCache=new Map(),streetMap=new Map((incidents?.streets||[]).map(s=>[s.id,s]));
 for(let i=1;i<route.geometry.length;i++){
  const a=route.geometry[i-1],b=route.geometry[i],len=meters(a,b),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],arrival=departureAt+route.duration_seconds*(offset+len/2)/Math.max(1,route.distance_meters)*1000;
  const names=(route.steps||[]).filter(s=>s.way_points?.[0]<=i-1&&s.way_points?.at(-1)>=i).map(s=>s.name||'');
  const e=matchMapEdge(data,a,b,names),t=e?.road.tags||{},phase=lightPhase(mid,arrival);
  let lighting=['yes','24/7'].includes(t.lit)?'MAPPED_LIT':['no','disused'].includes(t.lit)?'MAPPED_UNLIT':'UNKNOWN';
  const current=(incidents?.observations||[]).filter(o=>Date.parse(o.expires_at)>arrival&&Date.parse(o.observed_at)<=departureAt&&(o.time_of_day==='any'||o.time_of_day==='after_dark'&&phase==='AFTER_DARK'||o.time_of_day==='daylight'&&phase==='DAYLIGHT')&&matchesStreet(a,b,o.location,streetMap.get(o.location.street_id),names));
  for(const o of current)validUntil=Math.min(validUntil,Date.parse(o.expires_at));
  const kinds=new Set(current.map(o=>o.kind));
  if(kinds.has('lighting_out')&&kinds.has('lighting_working'))lighting='CONFLICT';else if(kinds.has('lighting_out'))lighting='OBSERVED_OUT';else if(kinds.has('lighting_working'))lighting='OBSERVED_WORKING';
  const walkway=(['footway','pedestrian','steps'].includes(t.highway)||['yes','both','left','right','separate'].includes(t.sidewalk))?'MAPPED_WALKWAY':t.sidewalk==='no'?'MAPPED_NO_SIDEWALK':'UNKNOWN';
  const restricted=['no','private'].includes(t.access)||t.foot==='no'||kinds.has('walkway_closed');
  if(e)summary.mapped_meters+=len;if(lighting==='MAPPED_LIT')summary.mapped_lit_meters+=len;if(lighting==='MAPPED_UNLIT')summary.mapped_unlit_meters+=len;
  if(['OBSERVED_OUT','OBSERVED_WORKING'].includes(lighting))summary.current_lighting_meters+=len;
  if(!['UNKNOWN','CONFLICT'].includes(lighting))summary.lighting_known_meters+=len;else summary.unknown_lighting_meters+=len;
  if(walkway!=='UNKNOWN')summary.walkway_known_meters+=len;if(walkway==='MAPPED_WALKWAY')summary.mapped_walkway_meters+=len;if(restricted)summary.restricted_meters+=len;
  let accessible=false;
  if(e&&!stale){for(const start of [e.from,e.to]){
   if(!pathCache.has(start))pathCache.set(start,shortPaths(data,start));const paths=pathCache.get(start),connection=meters(mid,data.nodes.get(start)||mid);
   for(const p of data.places){if(!p.connected_node||meters(mid,p.point)>350)continue;const d=(paths.get(p.connected_node)??Infinity)+connection;if(d>350)continue;
    const at=arrival+d/1.2*1000,status=listedHours(p.tags.opening_hours,p.point,at);if(!facilities.has(p.id))facilities.set(p.id,{...publicPlace(p,at,meters(mid,p.point)),walking_connection_meters:Math.round(d)});
    if(status==='LISTED_OPEN')accessible=true;
   }
  }}
  if(accessible)gap=0;else{gap+=len;longest=Math.max(longest,gap);}
  const from=Math.round(offset);offset+=len;const item={from_meters:from,to_meters:Math.round(offset),start_index:i-1,end_index:i,lighting,walkway,restricted,phase,source_url:e?.road.source_url||null,map_updated_at:e?.road.updated_at||null,arrival_at:new Date(arrival).toISOString()};
  const prev=stretches.at(-1);if(prev&&['lighting','walkway','restricted','phase','source_url'].every(k=>prev[k]===item[k])){prev.to_meters=item.to_meters;prev.end_index=item.end_index;}else stretches.push(item);
 }
 Object.keys(summary).forEach(k=>summary[k]=Math.round(summary[k]));summary.longest_facility_gap_meters=Math.round(longest);
 const helpPlaces=data.places.filter(p=>['police','hospital'].includes(p.tags.amenity)).map(p=>({p,d:Math.min(...route.geometry.slice(1).map((v,i)=>segmentDistanceKm(p.point,route.geometry[i],v)*1000))})).filter(v=>v.d<=800).sort((a,b)=>a.d-b.d);
 const selectedHelp=['police','hospital'].flatMap(category=>helpPlaces.filter(v=>v.p.tags.amenity===category).slice(0,4)).map(({p,d})=>({...publicPlace(p,departureAt,d),distance_basis:'ROUTE',estimated_arrival_at:null}));
 const environment={version:data.version,collected_at:data.collected_at,evaluated_at:new Date(departureAt).toISOString(),valid_until:new Date(validUntil).toISOString(),stale,summary,stretches,report_areas:areaReports,surroundings,facilities:[...facilities.values()].slice(0,20),nearby_places:nearbyPlaces(data,route.geometry[0],departureAt).slice(0,3),help_places:selectedHelp,activity:'UNKNOWN',limitations:data.limitations};
 return {...route,environment};
}
export function rankWalkingRoutes(routes,preference='FASTEST',extraMinutes=5) {
 if(routes.every(r=>r.is_demo_data))return routes;
 const eligible=routes.filter(r=>r.extra_minutes<=extraMinutes&&!(r.environment?.summary.restricted_meters>0));
 const ready=eligible.length>=2&&eligible.every(r=>r.environment&&!r.environment.stale&&r.environment.summary.mapped_meters>=r.distance_meters*.9);
 const lightReady=ready&&eligible.every(r=>r.environment.summary.lighting_known_meters>=r.distance_meters*.9);
 const placeReady=ready&&eligible.every(r=>r.environment.facilities.length>0)&&eligible.some(r=>r.environment.facilities.some(p=>p.hours_status==='LISTED_OPEN'));
 const availability={lighting:lightReady,nearby_places:placeReady};
 if((preference==='LIGHTING'&&lightReady)||(preference==='NEARBY_PLACES'&&placeReady)){
  const metric=r=>preference==='LIGHTING'?r.environment.summary.mapped_unlit_meters+r.environment.stretches.filter(s=>s.lighting==='OBSERVED_OUT').reduce((n,s)=>n+s.to_meters-s.from_meters,0):r.environment.summary.longest_facility_gap_meters;
  const best=[...eligible].sort((a,b)=>metric(a)-metric(b)||a.duration_seconds-b.duration_seconds)[0];
  const fastest=routes.find(r=>r.extra_minutes===0)||routes[0];
  // Unknown lighting cannot hide a worse alternative: require improvement even under its worst case.
  const robust=preference==='LIGHTING'?metric(best)+best.environment.summary.unknown_lighting_meters+30<metric(fastest):metric(best)+30<metric(fastest);
  if(robust){routes.sort((a,b)=>(a===best?-1:b===best?1:a.duration_seconds-b.duration_seconds));best.label=preference==='LIGHTING'?'Less mapped unlit walking':'More mapped facilities within walking reach';best.decision={basis:preference,summary:`${best.extra_minutes} extra minutes. ${best.label}. Current conditions and assistance remain unconfirmed.`,reasons:[{kind:'TIME',text:`${Math.ceil(best.duration_seconds/60)} min walking · ${best.distance_meters} m`}]};}
 }
 routes.forEach(r=>{
  r.environment.preference=preference;r.environment.preference_availability=availability;
  if(preference!=='FASTEST'&&r.decision?.basis==='WALKING_TIME')r.decision.summary+=' This preference could not establish a reliable improvement among these options.';
  r.decision.reasons.push({kind:'ENVIRONMENT',text:`${r.environment.summary.lighting_known_meters} m with lighting information; ${r.environment.summary.unknown_lighting_meters} m unknown. Pedestrian activity is unknown.`});
 });return routes;
}
