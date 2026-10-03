import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlaces,fetchJson,ApiError} from '../src/providers.js';
import {buildApp} from '../src/app.js';
const fallback=[{place_id:1,display_name:'Indian Museum, Kolkata',lat:'22.558',lon:'88.351'}];
test('primary timeout, gateway, quota and credential failures still try the bounded Kolkata fallback',async()=>{
 for(const code of ['PROVIDER_UNAVAILABLE','PROVIDER_ERROR','RATE_LIMITED','INVALID_PROVIDER_RESPONSE']){
  const requests=[];
  const result=await searchPlaces('Indian Museum Kolkata','key',async(url,options,timeout,policy)=>{
   requests.push({url,timeout,policy});if(requests.length===1)throw new ApiError(code,'Primary unavailable',503);return fallback;
  });
  assert.equal(result[0].label,'Indian Museum, Kolkata');assert.equal(requests.length,2);assert.equal(requests[0].timeout+requests[1].timeout,15000);assert.ok(requests.every(r=>r.policy.singleAttempt));assert.equal(new URL(requests[1].url).searchParams.get('bounded'),'1');
 }
});
test('both search services unavailable gives an actionable error and never an invented empty result',async()=>{
 await assert.rejects(searchPlaces('Museum','key',async()=>{throw new ApiError('PROVIDER_UNAVAILABLE','Timeout',503);}),e=>e.code==='SEARCH_UNAVAILABLE'&&e.message.includes('map'));
});
test('single-attempt search requests never use up the phone timeout by retrying network failures',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw TypeError('fetch failed');});
 await assert.rejects(fetchJson('https://example.test',{},7000,{singleAttempt:true}));assert.equal(requests,1);
});
test('duplicate simultaneous searches share one provider lookup and successful queries reuse normalized cache',async()=>{
 let finish,requests=0;const app=buildApp({disableWorker:true,searchPlaces:()=>{requests++;return new Promise(r=>{finish=r;});}});
 try{
  const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();const headers={authorization:'Bearer '+session.session_token};
  const first=app.inject({url:'/v1/places?q=Indian%20Museum',headers});await new Promise(r=>setImmediate(r));
  const second=app.inject({url:'/v1/places?q=indian%20%20museum',headers});await new Promise(r=>setImmediate(r));assert.equal(requests,1);
  finish([{label:'Indian Museum',latitude:22.558,longitude:88.351}]);assert.equal((await first).statusCode,200);assert.equal((await second).statusCode,200);
  assert.equal((await app.inject({url:'/v1/places?q=INDIAN%20MUSEUM',headers})).statusCode,200);assert.equal(requests,1);
 }finally{await app.close();}
});
