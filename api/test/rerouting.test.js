import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {routeLive,ApiError} from '../src/providers.js';
import {avoidancePolygon,avoidsAreas,pointAhead,freshOrigin} from '../src/rerouting.js';

const at=Date.parse('2026-10-02T09:00:00Z'),origin=[88.35,22.56],destination=[88.35,22.57];
const route=(id,geometry,duration=600)=>({route_id:id,geometry,duration_seconds:duration,distance_meters:1200,origin_snap_meters:0,steps:[]});
const straight=route('current',[origin,destination]);
const east=route('east',[origin,[88.352,22.56],[88.352,22.57],destination],800);
const west=route('west',[origin,[88.348,22.56],[88.348,22.57],destination],900);
const fix=(extra={})=>({longitude:origin[0],latitude:origin[1],timestamp_ms:at,accuracy_meters:5,sequence:at,...extra});
async function client(provider=async()=>[straight,east,west]){
 let time=at,counter=0;const app=buildApp({disableWorker:true,now:()=>time,routeLive:provider});
 const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();
 const owner=session.installation_id;
 app.store.put('trip',{id:'trip',owner,mode:'LIVE',state:'CHECK_IN_PENDING',origin:{longitude:origin[0],latitude:origin[1]},destination:{longitude:destination[0],latitude:destination[1],label:'Destination'},route:{...straight,route_revision:1},last_location:fix(),last_sequence:at,contacts:[],check_in:{id:'watch',status:'PENDING',deadline_ms:at+300000},version:1});
 const call=(path,payload,key)=>app.inject({method:'POST',url:'/v1/trips/trip/'+path,payload,headers:{authorization:'Bearer '+session.session_token,'idempotency-key':key||'cmd-'+counter++}});
 return {app,call,advance:n=>{time+=n;}};
}
test('rerouting filters the current stretch and preserves the journey, destination and watch on acceptance',async()=>{
 const requests=[];const c=await client(async(a,b,key,options)=>{requests.push({a,b,options});return [straight,east,west];});
 try{
  const response=await c.call('reroute',{origin:fix(),avoid_ahead_meters:100});assert.equal(response.statusCode,200);
  const proposal=response.json();assert.deepEqual(proposal.routes.map(r=>r.route_id),['east','west']);assert.equal(proposal.routes[0].risk_level,'UNKNOWN');
  assert.equal(requests[0].options.avoid_polygons.type,'Polygon');assert.deepEqual(requests[0].a,origin);assert.deepEqual(requests[0].b,destination);
  assert.equal(c.app.store.get('trip','trip').route.route_id,'current');
  const body={proposal_id:proposal.proposal_id,route_id:'west',route_revision:2,geometry:[[0,0],[1,1]]};
  const accepted=await c.call('route',body,'accept-once');assert.equal(accepted.statusCode,200);const trip=accepted.json();
  assert.equal(trip.route.route_id,'west');assert.equal(trip.state,'CHECK_IN_PENDING');assert.equal(trip.check_in.deadline_ms,at+300000);assert.equal(trip.destination.label,'Destination');assert.equal(trip.avoid_areas.length,1);
  assert.equal((await c.call('route',body,'accept-once')).json().version,trip.version);
  assert.deepEqual(trip.route.geometry.at(-1),destination);
 }finally{await c.app.close();}
});
test('rerouting rejects stale, missing, future and inaccurate GPS before making provider requests',async()=>{
 let requests=0;const c=await client(async()=>{requests++;return [east];});
 try{for(const origin of [null,{longitude:88.35,latitude:22.56},fix({timestamp_ms:at-60001}),fix({timestamp_ms:at+6000}),fix({accuracy_meters:51}),fix({accuracy_meters:0})])assert.equal((await c.call('reroute',{origin})).json().code,'FRESH_GPS_REQUIRED');assert.equal(requests,0);}finally{await c.app.close();}
});
test('no distinct option, an unsafe geometry and provider failure leave the current route and timer intact',async()=>{
 for(const provider of [async()=>[straight],async()=>[{...east,geometry:[origin,[88.35,22.5609],destination]}],async()=>{throw new ApiError('PROVIDER_UNAVAILABLE','Routing unavailable.',503);}]){
  const c=await client(provider);try{const response=await c.call('reroute',{origin:fix(),avoid_ahead_meters:100});assert.ok([422,503].includes(response.statusCode));assert.equal(c.app.store.get('trip','trip').route.route_id,'current');assert.equal(c.app.store.get('trip','trip').check_in.deadline_ms,at+300000);assert.equal(c.app.store.get('reroute','trip'),null);}finally{await c.app.close();}
 }
});
test('expired proposals, moved positions, stale acceptance and mismatched proposal IDs cannot change the journey',async()=>{
 for(const problem of ['expiry','moved','gps','id']){
  const c=await client();try{const proposal=(await c.call('reroute',{origin:fix()})).json();
   if(problem==='expiry')c.advance(300001);
   if(problem==='moved'){const t=c.app.store.get('trip','trip');t.last_location=fix({longitude:88.352});c.app.store.put('trip',t);}
   if(problem==='gps')c.advance(61000);
   const result=await c.call('route',{proposal_id:problem==='id'?'wrong':proposal.proposal_id,route_id:'east',route_revision:2});assert.ok([409,422].includes(result.statusCode));assert.equal(c.app.store.get('trip','trip').route.route_id,'current');
  }finally{await c.app.close();}
 }
});
test('a route calculation finishing after journey end cannot publish or accept a proposal',async()=>{
 let finish;const c=await client(()=>new Promise(resolve=>{finish=resolve;}));
 try{const pending=c.call('reroute',{origin:fix()});await new Promise(resolve=>setImmediate(resolve));const ended=await c.call('end',{});assert.equal(ended.statusCode,200);finish([east]);assert.equal((await pending).statusCode,409);assert.equal(c.app.store.get('reroute','trip'),null);}finally{await c.app.close();}
});
test('subsequent alternatives retain earlier avoided areas',async()=>{
 let options;const c=await client(async(a,b,key,o)=>{options=o;return [east];});
 try{const t=c.app.store.get('trip','trip');t.avoid_areas=[{center:[88.347,22.565],radius_meters:35}];c.app.store.put('trip',t);assert.equal((await c.call('reroute',{origin:fix(),avoid_ahead_meters:100})).statusCode,200);assert.equal(options.avoid_polygons.type,'MultiPolygon');assert.equal(options.avoid_polygons.coordinates.length,2);}finally{await c.app.close();}
});
test('ORS receives a closed avoidance polygon; geometric verification checks entire segments',async()=>{
 const area={center:pointAhead(straight.geometry,origin,100),radius_meters:35},polygon=avoidancePolygon([area]);
 assert.deepEqual(polygon.coordinates[0][0],polygon.coordinates[0].at(-1));assert.equal(avoidsAreas(straight,[area]),false);assert.equal(avoidsAreas(east,[area]),true);assert.deepEqual(freshOrigin(fix(),at),origin);
 let request;await routeLive(origin,destination,'test-key',{avoid_polygons:polygon},async(url,options)=>{request=JSON.parse(options.body);return {features:[{geometry:{type:'LineString',coordinates:east.geometry},properties:{summary:{distance:1200,duration:800},segments:[]}}]};});
 assert.deepEqual(request.options.avoid_polygons,polygon);assert.equal(request.alternative_routes.target_count,3);
});
test('accepting a route with an outdated check-in state cannot discard the current watch',async()=>{
 const c=await client();try{
  const proposal=(await c.call('reroute',{origin:fix()})).json();
  const result=await c.call('route',{proposal_id:proposal.proposal_id,route_id:'east',route_revision:2,expected_check_in_id:null});assert.equal(result.json().code,'CHECK_IN_CHANGED');assert.equal(c.app.store.get('trip','trip').check_in.id,'watch');assert.equal(c.app.store.get('trip','trip').route.route_id,'current');
 }finally{await c.app.close();}
});
