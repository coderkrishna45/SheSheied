import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadWalkingData,enrichWalkingRoute,listedHours,matchMapEdge,rankWalkingRoutes,lightPhase,nearbyPlaces} from '../src/walking_environment.js';
import {routePolygonStretches,validPolygon} from '../src/geography.js';
import {subdivideRoute,labelRoutes} from '../src/evidence.js';
import {buildApp} from '../src/app.js';

const at=Date.parse('2026-10-03T12:00:00Z'),a=[88.43,22.57],b=[88.43,22.58];
const route=()=>subdivideRoute({route_id:'r',geometry:[a,b],distance_meters:1112,duration_seconds:900,steps:[{name:'Test Road',way_points:[0,1]}],risk_level:'UNKNOWN',decision:{basis:'WALKING_TIME',summary:'',reasons:[]},extra_minutes:0},10);
const square=(x,y,size=.002)=>({type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]});
function input(){return {schema_version:1,version:'test',collected_at:new Date(at).toISOString(),license:'ODbL-1.0',blocked_node_ids:[],roads:[{id:'way/1',geometry:[a,b],node_ids:['1','2'],tags:{highway:'footway',name:'Test Road',lit:'yes'},updated_at:'2026-09-01T00:00:00Z',source_url:'https://www.openstreetmap.org/way/1'}],places:[{id:'node/2',name:'Public pharmacy',point:b,tags:{amenity:'pharmacy',opening_hours:'24/7'},entrance_node_id:'2',entrance_status:'MAPPED_ENTRANCE',updated_at:'2026-09-01T00:00:00Z',source_url:'https://www.openstreetmap.org/node/2'}],areas:[],report_areas:[]};}
test('polygon matching finds crossings with sparse endpoints, handles holes and tangent boundaries, rejects malformed geometry',()=>{
 const g=square(88.429,22.574);assert.ok(validPolygon(g));assert.equal(routePolygonStretches([a,b],g).length,1);
 const hole=square(88.4295,22.5745,.001).coordinates[0];g.coordinates.push(hole);assert.equal(routePolygonStretches([a,b],g).length,2);
 assert.equal(routePolygonStretches([[88.429,22.573],[88.429,22.577]],g).length,0);
 assert.ok(!validPolygon({type:'Polygon',coordinates:[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}));
});
test('map matching refuses parallel paths, ambiguous equal candidates and unresolved bridge levels',()=>{
 const d=loadWalkingData(input(),at),r=route();assert.ok(matchMapEdge(d,r.geometry[0],r.geometry[1],['Test Road']));
 assert.equal(matchMapEdge(d,[88.4302,22.571],[88.4302,22.57105],['Test Road']),null);
 const i=input();i.roads.push({...i.roads[0],id:'way/3',source_url:'https://www.openstreetmap.org/way/3'});assert.equal(matchMapEdge(loadWalkingData(i,at),r.geometry[0],r.geometry[1],['Test Road']),null);
 i.roads=[{...i.roads[0],tags:{...i.roads[0].tags,bridge:'yes',layer:'1'}}];assert.equal(matchMapEdge(loadWalkingData(i,at),r.geometry[0],r.geometry[1],['Test Road']),null);
});
test('opening hours use India wall time, overnight schedules, imminent closing and unknown exceptions',()=>{
 const t=Date.parse('2026-10-03T16:00:00Z'); // 21:30 IST on Saturday
 assert.equal(listedHours('Mo-Su 20:00-02:00',a,t),'LISTED_OPEN');assert.equal(listedHours('Mo-Su 09:00-21:00',a,t),'LISTED_CLOSED');
 assert.equal(listedHours('Mo-Su 09:00-21:35',a,t),'CLOSING_SOON');
 for(const v of [undefined,'bad data','PH off; Mo-Su 09:00-22:00','sunset-sunrise'])assert.equal(listedHours(v,a,t),'UNKNOWN');
 assert.equal(lightPhase(a,Date.parse('2026-10-03T06:00:00Z')),'DAYLIGHT');assert.equal(lightPhase(a,Date.parse('2026-10-03T18:00:00Z')),'AFTER_DARK');
});
test('missing map facts stay unknown, stale snapshots cannot certify preferences and facilities need a real connected entrance',()=>{
 const d=loadWalkingData(input(),at),r=enrichWalkingRoute(route(),d,{},at);
 assert.ok(r.environment.summary.mapped_lit_meters>1100);assert.ok(r.environment.facilities.length===1);assert.equal(r.environment.activity,'UNKNOWN');assert.equal(r.risk_level,'UNKNOWN');
 const absent=enrichWalkingRoute(route(),loadWalkingData(null,at),{},at);assert.ok(absent.environment.summary.unknown_lighting_meters>1100);assert.equal(absent.environment.summary.mapped_unlit_meters,0);
 const i=input();i.places[0].entrance_node_id=null;assert.equal(enrichWalkingRoute(route(),loadWalkingData(i,at),{},at).environment.facilities.length,0);
 const old=enrichWalkingRoute(route(),d,{},at+31*86400000);assert.equal(old.environment.stale,true);assert.equal(rankWalkingRoutes(labelRoutes([old,{...old,route_id:'other',duration_seconds:950}]),'LIGHTING')[0].decision.basis,'WALKING_TIME');
 assert.ok(nearbyPlaces(d,b,at).length===1);
});
test('named-area association keeps event identity and history without converting context to street incidents',()=>{
 const i=input();i.areas=[{id:'way/9',name:'Block',geometry:square(88.429,22.574),tags:{place:'city_block'},source_url:'https://www.openstreetmap.org/way/9'}];i.report_areas=[{id:'area',area_id:'way/9',event_ids:['event','unknown'],relation:'NAMED_AREA_CONTEXT',method:'Named block, exact location unknown',association_source_url:'https://publisher.example/report'}];
 const report={id:'event',occurred:{start:'2025-01-01T00:00:00Z'}},r=enrichWalkingRoute(route(),loadWalkingData(i,at),{context:[report]},at);
 assert.equal(r.environment.report_areas.length,1);assert.equal(r.environment.report_areas[0].historical,true);assert.deepEqual(r.environment.report_areas[0].event_ids,['event']);assert.equal(r.risk_level,'UNKNOWN');
});
test('real downloaded snapshot retains public map provenance and no contributor or residential address metadata',()=>{
 const bytes=readFileSync(new URL('../../evidence/saltlake/environment/walking.v1.json',import.meta.url),'utf8'),raw=JSON.parse(bytes),data=loadWalkingData(raw,Date.parse(raw.collected_at)+1000);
 assert.ok(data.roads.length>1000);assert.ok(data.places.length>100);assert.ok(data.report_areas.some(a=>a.id==='bg-block-historical-context'));
 for(const key of ['"uid":','"user":','"changeset":','"addr:housenumber":','"addr:street":'])assert.ok(!bytes.includes(key));
});
test('API preference refresh, nearby lookup and area endpoint rejection preserve the current journey and pending watch',async()=>{
 const i=input();i.areas=[{id:'way/9',name:'Block',geometry:square(88.429,22.574),tags:{place:'city_block'},source_url:'https://www.openstreetmap.org/way/9'}];i.report_areas=[{id:'area',area_id:'way/9',event_ids:['event'],relation:'NAMED_AREA_CONTEXT',method:'Named block',association_source_url:'https://publisher.example/report'}];
 const requested=[];const app=buildApp({disableWorker:true,now:()=>at,walkingDataset:i,config:{INCIDENT_DATA_PATH:'',WALKING_DATA_PATH:'',LIVE_ALERTS_ENABLED:'false'},routeLive:async(origin,destination,key,options)=>{requested.push(options);return [{...route(),geometry:[origin,...(options.via?[options.via]:[]),destination],origin_snap_meters:0,destination_snap_meters:0}];}});
 try{const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;let n=0;const call=(method,url,payload)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+token,'idempotency-key':String(n++)}});
  const p=(await call('POST','/v1/plans',{mode:'LIVE',origin:{longitude:a[0],latitude:a[1]},destination:{longitude:b[0],latitude:b[1]}})).json();
  assert.equal((await call('POST',`/v1/plans/${p.id}/compare`,{preference:'LIGHTING',max_extra_minutes:5})).statusCode,200);
  assert.equal((await call('POST','/v1/plans',{mode:'LIVE',origin:{longitude:88.43,latitude:22.575},destination:{longitude:b[0],latitude:b[1]},avoid_area_ids:['area']})).json().code,'AREA_INCLUDES_ENDPOINT');
  const t=(await call('POST','/v1/trips',{plan_id:p.id,route_id:p.routes[0].route_id,contacts:[]})).json();
  const pending=(await call('POST',`/v1/trips/${t.id}/check-ins`,{kind:'PERSONAL',window_seconds:120})).json();
  const fix={longitude:88.43,latitude:22.577,timestamp_ms:at,accuracy_meters:5,sequence:1};await call('POST',`/v1/trips/${t.id}/locations`,fix);
  assert.equal((await call('POST',`/v1/trips/${t.id}/nearby`,{origin:fix})).json().places[0].id,'node/2');
  const proposal=(await call('POST',`/v1/trips/${t.id}/reroute`,{origin:fix,via_place_id:'node/2'})).json();assert.equal(proposal.routes[0].via_place.id,'node/2');assert.deepEqual(requested.at(-1).via,b);
  const after=(await call('GET',`/v1/trips/${t.id}`)).json();assert.equal(after.check_in.deadline_ms,pending.check_in.deadline_ms);assert.deepEqual(after.destination,t.destination);assert.equal(app.store.list('sos').length,0);
 }finally{await app.close();}
});
test('lighting preference chooses a supported improvement while detour limits, restricted access and unknown stretches prevent promotion',()=>{
 const i=input();i.roads[0].tags.lit='no';i.roads.push({...i.roads[0],id:'way/3',source_url:'https://www.openstreetmap.org/way/3',geometry:[[88.432,22.57],[88.432,22.58]],node_ids:['3','4'],tags:{highway:'footway',name:'Test Road',lit:'yes'}});
 const d=loadWalkingData(i,at),fast=enrichWalkingRoute(route(),d,{},at),alt=enrichWalkingRoute(subdivideRoute({...route(),route_id:'lit',geometry:i.roads[1].geometry,duration_seconds:960,steps:[]},10),d,{},at);
 const compare=(extra=5,change=()=>{})=>{const rs=structuredClone([fast,alt]);change(rs[1]);return rankWalkingRoutes(labelRoutes(rs),'LIGHTING',extra);};
 assert.equal(compare()[0].route_id,'lit');assert.equal(compare()[0].decision.basis,'LIGHTING');assert.equal(compare()[0].risk_level,'UNKNOWN');
 assert.equal(compare(0)[0].route_id,'r');assert.equal(compare(5,r=>r.environment.summary.restricted_meters=1)[0].route_id,'r');
 assert.equal(compare(5,r=>{r.environment.summary.lighting_known_meters=100;r.environment.summary.unknown_lighting_meters=1012;})[0].route_id,'r');
 assert.equal(compare(5,r=>{r.environment.summary.mapped_unlit_meters=1050;r.environment.summary.unknown_lighting_meters=90;})[0].route_id,'r');
});
test('a reviewed lighting observation cannot remain cached beyond its expiry or override an arrival after expiry',()=>{
 const expiry=at+120000,observation={kind:'lighting_out',observed_at:new Date(at-1000).toISOString(),expires_at:new Date(expiry).toISOString(),time_of_day:'any',location:{street_id:'test',geometry:{type:'LineString',coordinates:[a,b]}}};
 const incidents={streets:[{id:'test',name:'Test Road',aliases:[]}],observations:[observation]};
 const r=enrichWalkingRoute(route(),loadWalkingData(input(),at),incidents,at);
 assert.equal(Date.parse(r.environment.valid_until),expiry);assert.ok(r.environment.stretches.some(s=>s.lighting==='OBSERVED_OUT'));assert.ok(r.environment.stretches.some(s=>s.lighting==='MAPPED_LIT'));
 const expired=enrichWalkingRoute(route(),loadWalkingData(input(),at),incidents,expiry);assert.ok(expired.environment.stretches.every(s=>s.lighting==='MAPPED_LIT'));
});
