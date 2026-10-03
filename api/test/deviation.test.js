import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {validateDeparture,protection} from '../src/deviation.js';
import {voiceAlertMessage,smsAlertMessage} from '../src/alert_messages.js';

const start=Date.parse('2026-10-03T12:00:00Z'),route={route_id:'walk',geometry:[[88.43,22.57],[88.43,22.58]],distance_meters:1112,duration_seconds:900,route_revision:1,steps:[]};
const origin={longitude:88.43,latitude:22.57},destination={longitude:88.43,latitude:22.58};
const trip={route,origin,destination,departure_protection:{enabled:true,window_seconds:120}};
const readings=()=>Array.from({length:10},(_,i)=>({longitude:88.431,latitude:22.574+i*.00001,accuracy_meters:5,timestamp_ms:start+i*5000,sequence:i}));
const body=()=>({route_revision:1,window_seconds:120,fixes:readings()});
test('departure requires opted-in sustained accurate evidence; jumps, gaps, old routes, endpoints and uncertain GPS fail',()=>{
 assert.equal(validateDeparture(trip,body(),start+45000).sequence,9);
 assert.throws(()=>validateDeparture({...trip,departure_protection:{enabled:false}},body(),start+45000),e=>e.code==='PROTECTION_DISABLED');
 for(const alter of [b=>b.route_revision=2,b=>b.fixes=b.fixes.slice(0,3),b=>b.fixes[5].accuracy_meters=90,b=>b.fixes[5].timestamp_ms=b.fixes[4].timestamp_ms,b=>b.fixes[5].longitude=88.45,b=>b.fixes[5].longitude=88.43,b=>b.window_seconds=300]){const b=body();alter(b);assert.throws(()=>validateDeparture(trip,b,start+45000));}
 assert.throws(()=>validateDeparture(trip,body(),start+90000));
 assert.throws(()=>validateDeparture({...trip,departure_grace_until_ms:start+180000},body(),start+45000));
 const b=body();b.fixes.forEach(f=>{f.longitude=88.4301;f.latitude=22.5701});assert.throws(()=>validateDeparture(trip,b,start+45000));
 assert.deepEqual(protection(null),{enabled:false,window_seconds:120});assert.throws(()=>protection({enabled:'true',window_seconds:120}));
});
async function client(enabled=true){let time=start+45000;const app=buildApp({disableWorker:true,now:()=>time,routeLive:async()=>[structuredClone(route)],config:{INCIDENT_DATA_PATH:'',WALKING_DATA_PATH:'',LIVE_ALERTS_ENABLED:'false'}});
 const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;let i=0;
 const call=(method,url,payload,k)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+token,'idempotency-key':k||String(i++)}});
 const p=(await call('POST','/v1/plans',{mode:'LIVE',origin,destination})).json();
 const t=(await call('POST','/v1/trips',{plan_id:p.id,route_id:p.routes[0].route_id,departure_protection:{enabled,window_seconds:120},contacts:[]})).json();
 return {app,call,t,advance:ms=>time+=ms};
}
test('departure timer is idempotent, survives phone absence, escalates once and explains departure in calls/SMS',async()=>{
 const c=await client();try{
  const b={...body(),kind:'DEVIATION',event_id:'departure-check'};
  const first=await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,b,'departure');assert.equal(first.statusCode,200);assert.equal(first.json().check_in.kind,'DEVIATION');assert.equal(first.json().check_in.deadline_ms,start+165000);
  assert.equal((await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,b,'departure')).json().check_in.id,'departure-check');
  const pending=(await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,{kind:'PERSONAL',window_seconds:300})).json();assert.equal(pending.check_in.deadline_ms,first.json().check_in.deadline_ms);
  c.advance(121000);await c.app.tick();await c.app.tick();assert.equal(c.app.store.list('sos').length,1);
  const incident=c.app.store.list('sos')[0];assert.equal(incident.check_in_kind,'DEVIATION');assert.match(voiceAlertMessage(incident),/moving away from their planned route/);assert.match(smsAlertMessage(incident),/moving away from their planned route/);
 }finally{await c.app.close();}
});
test('SAFE gives a detour grace period; ending closes departure escalation and disabled protection refuses it',async()=>{
 const c=await client();try{
  await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,{...body(),kind:'DEVIATION',event_id:'departure-check'});
  const safe=(await c.call('POST',`/v1/trips/${c.t.id}/check-ins/departure-check/resolve`,{status:'SAFE'})).json();assert.equal(safe.state,'ACTIVE');assert.equal(safe.departure_grace_until_ms,start+225000);
  assert.equal((await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,{...body(),kind:'DEVIATION'})).statusCode,409);
  c.advance(300000);await c.app.tick();assert.equal(c.app.store.list('sos').length,0);await c.call('POST',`/v1/trips/${c.t.id}/end`,{});
  assert.equal((await c.call('POST',`/v1/trips/${c.t.id}/check-ins`,{...body(),kind:'DEVIATION'})).statusCode,409);
 }finally{await c.app.close();}
 const disabled=await client(false);try{assert.equal((await disabled.call('POST',`/v1/trips/${disabled.t.id}/check-ins`,{...body(),kind:'DEVIATION'})).statusCode,409);}finally{await disabled.app.close();}
});
test('a missed departure check shares a private live journey link whose access ends with the journey',async()=>{
 let time=start+45000;const app=buildApp({disableWorker:true,now:()=>time,routeLive:async()=>[structuredClone(route)],config:{INCIDENT_DATA_PATH:'',WALKING_DATA_PATH:'',LIVE_ALERTS_ENABLED:'false',LIVE_SMS_ENABLED:'false',PUBLIC_BASE_URL:'https://api.example.test'}});
 try{const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;let n=0;const call=(method,url,payload)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+token,'idempotency-key':String(n++)}});
  const p=(await call('POST','/v1/plans',{mode:'LIVE',origin,destination})).json(),t=(await call('POST','/v1/trips',{plan_id:p.id,route_id:p.routes[0].route_id,departure_protection:{enabled:true,window_seconds:120},contacts:[{name:'Isolated test contact',phone:'+919999999999'}]})).json();
  await call('POST',`/v1/trips/${t.id}/check-ins`,{...body(),kind:'DEVIATION',event_id:'departure-check'});time+=121000;await app.tick();
  const incident=app.store.list('sos')[0],path=new URL(incident.companion_url).pathname+'/data';assert.equal((await app.inject({url:path})).statusCode,200);assert.ok(smsAlertMessage(incident).includes(incident.companion_url));
  assert.equal(app.store.list('attempt')[0].status,'UNAVAILABLE');await call('POST',`/v1/trips/${t.id}/end`,{});assert.equal((await app.inject({url:path})).statusCode,410);
 }finally{await app.close();}
});
