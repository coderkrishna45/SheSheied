import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchJson,routeLive} from '../src/providers.js';

const policy={retryTimeouts:true,retryTransientStatuses:true};
test('a routing timeout recovers on one retry with a fresh abort signal',async t=>{
  const signals=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    signals.push(options.signal);
    if(signals.length===1)throw new DOMException('Timed out','TimeoutError');
    return Response.json({recovered:true});
  });
  assert.deepEqual(await fetchJson('https://example.test',{},15000,policy),{recovered:true});
  assert.equal(signals.length,2);assert.notEqual(signals[0],signals[1]);
});
test('routing also retries a timeout while reading the response body',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>++calls===1?{ok:true,json:async()=>{throw new DOMException('Timed out','TimeoutError');}}:Response.json({ok:true}));
  assert.deepEqual(await fetchJson('https://example.test',{},15000,policy),{ok:true});assert.equal(calls,2);
});
test('persistent routing timeouts stop after two attempts with an actionable error',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new DOMException('Timed out','TimeoutError');});
  await assert.rejects(fetchJson('https://example.test',{},15000,policy),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.message.includes('after retrying'));
  assert.equal(calls,2);
});
test('a temporary gateway failure recovers but rate limits and credential errors are not retried',async t=>{
  for(const status of [502,503,504,429,401,403,400]){
    let calls=0;const mock=t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response('',{status}):Response.json({ok:true}));
    if([502,503,504].includes(status)){assert.deepEqual(await fetchJson('https://example.test',{},15000,policy),{ok:true});assert.equal(calls,2);}
    else{await assert.rejects(fetchJson('https://example.test',{},15000,policy));assert.equal(calls,1);}
    mock.mock.restore();
  }
});
test('ordinary lookups keep their existing timeout policy and malformed JSON is not retried',async t=>{
  let calls=0;const mock=t.mock.method(globalThis,'fetch',async()=>{calls++;throw new DOMException('Timed out','TimeoutError');});
  await assert.rejects(fetchJson('https://example.test'),e=>e.code==='PROVIDER_UNAVAILABLE');assert.equal(calls,1);mock.mock.restore();
  calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('invalid json');});
  await assert.rejects(fetchJson('https://example.test',{},15000,policy),e=>e.code==='INVALID_PROVIDER_RESPONSE');assert.equal(calls,1);
});
test('walking routes request a single bounded calculation before simplifying recovery',async()=>{
  let captured;
  await routeLive([88.35,22.56],[88.35,22.57],'test-key',{},async(url,options,timeout,recovery)=>{
    captured={timeout,recovery};
    return {features:[{geometry:{type:'LineString',coordinates:[[88.35,22.56],[88.35,22.57]]},properties:{summary:{distance:1200,duration:800}}}]};
  });
  assert.equal(captured.timeout,10000);assert.deepEqual(captured.recovery,{singleAttempt:true});
});
test('walking timeout tries lighter alternatives while preserving every avoidance and endpoint',async()=>{
 const requests=[],origin=[88.35,22.56],destination=[88.35,22.57],avoid={type:'Polygon',coordinates:[[[88.36,22.56],[88.37,22.56],[88.36,22.57],[88.36,22.56]]]};
 const routes=await routeLive(origin,destination,'key',{avoid_polygons:avoid},async(url,options,timeout)=>{
  requests.push({body:JSON.parse(options.body),timeout});if(requests.length===1){const e=new Error('timeout');e.code='PROVIDER_UNAVAILABLE';throw e;}
  return {features:[{geometry:{type:'LineString',coordinates:[origin,destination]},properties:{summary:{distance:1200,duration:800}}}]};
 });
 assert.equal(routes.length,1);assert.equal(requests[0].body.alternative_routes.target_count,3);assert.equal(requests[1].body.alternative_routes.target_count,2);assert.deepEqual(requests[1].body.coordinates,[origin,destination]);assert.deepEqual(requests[1].body.options.avoid_polygons,avoid);assert.equal(requests.reduce((n,r)=>n+r.timeout,0),18000);
});
test('single-route recovery happens only after both alternative calculations fail and is explicitly labeled',async()=>{
 const requests=[],origin=[88.35,22.56],destination=[88.35,22.57];
 const routes=await routeLive(origin,destination,'key',{},async(url,options,timeout)=>{
  requests.push({body:JSON.parse(options.body),timeout});if(requests.length<3){const e=new Error('timeout');e.code='PROVIDER_UNAVAILABLE';throw e;}
  return {features:[{geometry:{type:'LineString',coordinates:[origin,destination]},properties:{summary:{distance:1200,duration:800}}}]};
 });
 assert.equal(requests.length,3);assert.equal(requests[2].body.alternative_routes,undefined);assert.equal(routes[0].alternatives_status,'TEMPORARILY_UNAVAILABLE');assert.equal(requests.reduce((n,r)=>n+r.timeout,0),26000);
});
