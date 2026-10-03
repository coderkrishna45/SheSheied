import test from 'node:test';
import assert from 'node:assert/strict';
import {walkingRouteCache} from '../src/route_cache.js';
const route={route_id:'route-0',geometry:[[88.35,22.56],[88.35,22.57]],distance_meters:1200,duration_seconds:800,steps:[]};
test('walking cache isolates geometry, exact endpoints, via and avoidance, and expires in five minutes',async()=>{
 let calls=0,at=1000000;const get=walkingRouteCache(async()=>{calls++;return [structuredClone(route)];},()=>at);
 const a=[88.35,22.56],b=[88.35,22.57];const first=await get(a,b,'key');first[0].geometry[0][0]=0;first[0].decision={summary:'old evidence'};
 const second=await get(a,b,'key');assert.equal(calls,1);assert.equal(second[0].geometry[0][0],88.35);assert.equal(second[0].decision,undefined);
 await get([88.35001,22.56],b,'key');await get(a,b,'key',{via:[88.351,22.561]});await get(a,b,'key',{avoid_polygons:{type:'Polygon',coordinates:[]}});assert.equal(calls,4);
 at+=300000;await get(a,b,'key');assert.equal(calls,5);
});
test('simultaneous route requests share work and failed requests never poison the cache',async()=>{
 let calls=0,resolve;const get=walkingRouteCache(()=>{calls++;return new Promise(r=>{resolve=r;});});
 const a=get([1,2],[3,4],'key'),b=get([1,2],[3,4],'key');assert.equal(calls,1);resolve([route]);assert.deepEqual(await a,await b);
 let attempts=0;const failing=walkingRouteCache(async()=>{if(++attempts===1)throw Error('unavailable');return [route];});
 await assert.rejects(failing([1,2],[3,4],'key'));assert.equal((await failing([1,2],[3,4],'key')).length,1);assert.equal(attempts,2);
});
test('restart seed accepts only recent real unrestricted provider geometry',async()=>{
 let calls=0;const get=walkingRouteCache(async()=>{calls++;return [route];},()=>1000000);
 const plan={created_at_ms:999999,geometry_source:'OpenRouteService walking directions',origin:{longitude:88.35,latitude:22.56},destination:{longitude:88.35,latitude:22.57},routes:[{...route,decision:{summary:'old evidence'}}]};
 get.seed([{...plan,geometry_source:'recorded demo'},{...plan,created_at_ms:0},{...plan,avoid_area_ids:['area']}]);await get([88.35,22.56],[88.35,22.57],'key');assert.equal(calls,1);
 const seeded=walkingRouteCache(async()=>{throw Error('provider offline');},()=>1000000);seeded.seed([plan]);const result=await seeded([88.35,22.56],[88.35,22.57],'key');assert.equal(result[0].decision,undefined);
});
test('a single fallback never replaces recent multiple routes and retry can recover missing alternatives',async()=>{
 let calls=0;const origin=[88.35,22.56],destination=[88.35,22.57],plan={created_at_ms:999999,geometry_source:'OpenRouteService walking directions',origin:{longitude:origin[0],latitude:origin[1]},destination:{longitude:destination[0],latitude:destination[1]}};
 const get=walkingRouteCache(async()=>{calls++;return [route];},()=>1000000);
 get.seed([{...plan,routes:[route,{...route,route_id:'r2'}]},{...plan,routes:[{...route,alternatives_status:'TEMPORARILY_UNAVAILABLE'}]}]);assert.equal((await get(origin,destination,'key')).length,2);assert.equal(calls,0);
 const retrying=walkingRouteCache(async()=>[route,{...route,route_id:'r2'}],()=>1000000);retrying.seed([{...plan,routes:[{...route,alternatives_status:'TEMPORARILY_UNAVAILABLE'}]}]);assert.equal((await retrying(origin,destination,'key')).length,2);
});
