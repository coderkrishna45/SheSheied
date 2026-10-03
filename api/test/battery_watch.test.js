import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {Store} from '../src/store.js';
import {batteryHeartbeat,batterySmsMessage,BATTERY_POLICY} from '../src/battery_watch.js';

const start=Date.now(),location={latitude:22.558,longitude:88.351,accuracy_meters:12,timestamp_ms:start};
const people=[{name:'One',phone:'+919999999999'},{name:'Two',phone:'+918888888888'}];
const config={LIVE_ALERTS_ENABLED:'true',LIVE_SMS_ENABLED:'true',N8N_WEBHOOK_URL:'https://cloud.example/webhook/delivery',WORKER_TOKEN:'worker',PUBLIC_BASE_URL:'https://api.example',TWILIO_AUTH_TOKEN:'token',TEST_RECIPIENT_ALLOWLIST:people.map(p=>p.phone).join(',')};
test('battery texts keep essential location and uncertainty without Unicode segment expansion',()=>{
 for(const address of ['Indian Museum, Kolkata','\u0995\u09b2\u0995\u09be\u09a4\u09be',"Park\u2019s Road\u2014Sector II",'Long address '.repeat(30)]){
  const sms=batterySmsMessage({percent:5,location:{...location,accuracy:12,address}},start+300000);
  assert.ok(/^[\x20-\x7e]+$/.test(sms));assert.ok(sms.length+40<=459);assert.ok(sms.includes('5%'));assert.ok(sms.includes('connection failed'));assert.ok(sms.includes('maps.google.com/?q=22.558,88.351'));assert.ok(sms.includes('Not a live location'));
 }
});
async function client(overrides={}){
 let at=start,n=0;const jobs=[],store=new Store();
 const options={disableWorker:true,store,config:{...config,...overrides},now:()=>at,locationResolver:async()=> 'Indian Museum, Jawaharlal Nehru Road, Kolkata',routeLive:async(a,b)=>[{route_id:'r',geometry:[a,b],duration_seconds:200,distance_meters:200,steps:[]}],dispatch:async(url,request)=>{jobs.push(JSON.parse(request.body));return {ok:true};}};
 let app=buildApp(options);const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();
 const call=(method,url,payload)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+session.session_token,'idempotency-key':'cmd-'+n++}});
 const plan=(await call('POST','/v1/plans',{mode:'LIVE',origin:{label:'Start',latitude:22.558,longitude:88.351},destination:{label:'Finish',latitude:22.56,longitude:88.352}})).json();
 const trip=(await call('POST','/v1/trips',{plan_id:plan.id,route_id:'r',contacts:people})).json();
 return {get app(){return app;},call,jobs,trip,advance:ms=>{at+=ms;},get at(){return at;},heartbeat:(changes={})=>call('POST',`/v1/trips/${trip.id}/battery`,{enabled:true,percent:5,charging:false,observed_at_ms:at,location:{...location,timestamp_ms:at},...changes}),restart:async()=>{await app.close();app=buildApp(options);},close:async()=>{await app.close();store.close();}};
}
test('battery watch validates current Android readings, uses hysteresis, and duplicate heartbeats cannot extend a deadline',()=>{
 const reading={enabled:true,percent:10,charging:false,observed_at_ms:start,location};
 const watch=batteryHeartbeat(null,reading,start);assert.equal(watch.state,'ARMED');assert.equal(watch.location.accuracy,12);assert.equal(watch.deadline_ms,start+BATTERY_POLICY.silence_ms);
 assert.equal(batteryHeartbeat(watch,reading,start+1000).deadline_ms,watch.deadline_ms);
 assert.equal(batteryHeartbeat(watch,{...reading,percent:12,observed_at_ms:start+1000},start+1000).state,'ARMED');
 for(const changes of [{percent:16},{charging:true},{enabled:false}])assert.notEqual(batteryHeartbeat(watch,{...reading,...changes,observed_at_ms:start+1000},start+1000).state,'ARMED');
 for(const changes of [{percent:-1},{percent:101},{percent:NaN},{charging:'false'},{observed_at_ms:start-120001},{location:{...location,latitude:99}},{location:{...location,accuracy_meters:1001}},{location:{...location,timestamp_ms:start-600001}}])assert.throws(()=>batteryHeartbeat(null,{...reading,...changes},start));
});
test('server persists last position and alerts every eligible Circle recipient once after the phone goes silent, including after restart',async()=>{
 const c=await client();try{
  assert.equal((await c.heartbeat()).statusCode,200);await new Promise(r=>setImmediate(r));await c.restart();
  c.advance(299999);await c.app.tick();assert.equal(c.jobs.length,0);c.advance(2);await c.app.tick();await c.app.tick();
  assert.equal(c.jobs.length,2);assert.ok(c.jobs.every(j=>j.channel==='SMS'));const watch=(await c.call('GET',`/v1/trips/${c.trip.id}/battery`)).json();assert.equal(watch.state,'ALERTED');assert.equal(watch.sms_attempts.length,2);
  const sms=watch.sms_attempts[0];const claim=await c.app.inject({method:'POST',url:`/internal/sms/${sms.id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});
  assert.equal(claim.statusCode,200);const message=claim.json().message;assert.ok(message.includes('5%'));assert.ok(message.includes('5 minutes'));assert.ok(message.includes('may have run out'));assert.ok(message.includes('Indian Museum'));assert.ok(message.includes('maps.google.com'));assert.ok(message.toLowerCase().includes('not a live location'));
  const sid='SM'+'a'.repeat(32),url=`/v1/provider/twilio/sms-status?attempt_id=${sms.id}`,payload={MessageSid:sid,MessageStatus:'delivered'},signed=config.PUBLIC_BASE_URL+url+Object.keys(payload).sort().map(k=>k+payload[k]).join('');
  const result=await c.app.inject({method:'POST',url,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':createHmac('sha1','token').update(signed).digest('base64')},payload:new URLSearchParams(payload).toString()});assert.equal(result.statusCode,200);assert.equal(c.app.store.get('sms_attempt',sms.id).status,'DELIVERED');
  c.advance(1000);assert.equal((await c.heartbeat()).json().state,'RECOVERED');c.advance(300001);await c.app.tick();assert.equal(c.jobs.length,2);
 }finally{await c.close();}
});
test('healthy heartbeats, charging, disabled protection and ended journeys prevent outage alerts',async()=>{
 for(const change of [{percent:16},{charging:true},{enabled:false},'end']){
  const c=await client();try{
   await c.heartbeat();c.advance(1000);
   if(change==='end')await c.call('POST',`/v1/trips/${c.trip.id}/end`,{});else await c.heartbeat(change);
   c.advance(300001);await c.app.tick();assert.equal(c.jobs.length,0);
  }finally{await c.close();}
 }
 const c=await client();try{await c.heartbeat();c.advance(299000);await c.heartbeat();c.advance(2000);await c.app.tick();assert.equal(c.jobs.length,0);}finally{await c.close();}
});
test('unapproved recipients never dispatch, and reconnecting prevents an already dispatched battery job from being claimed',async()=>{
 const c=await client({TEST_RECIPIENT_ALLOWLIST:people[0].phone});try{
  await c.heartbeat({location:undefined});c.advance(300001);await c.app.tick();assert.equal(c.jobs.length,1);
  const watch=(await c.call('GET',`/v1/trips/${c.trip.id}/battery`)).json();assert.equal(watch.sms_attempts[1].status,'UNAVAILABLE');const sms=watch.sms_attempts[0];
  await c.heartbeat();const claim=await c.app.inject({method:'POST',url:`/internal/sms/${sms.id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});assert.equal(claim.statusCode,409);
 }finally{await c.close();}
});
test('battery demo runs the server deadline and shows explicitly simulated messages without creating delivery jobs',async()=>{
 const c=await client();try{
  const demo=(await c.call('POST','/v1/battery-demo',{contacts:people})).json();assert.equal(demo.state,'ARMED');c.advance(19999);await c.app.tick();assert.equal((await c.call('GET',`/v1/battery-demo/${demo.id}`)).json().state,'ARMED');
  c.advance(2);await c.app.tick();const finished=(await c.call('GET',`/v1/battery-demo/${demo.id}`)).json();assert.equal(finished.state,'ALERTED');assert.equal(finished.sms_attempts.length,2);assert.ok(finished.sms_attempts.every(s=>s.status==='SIMULATED'));assert.ok(finished.message.startsWith('DEMO'));assert.equal(c.jobs.length,0);assert.equal(c.app.store.list('sms_attempt').length,0);
 }finally{await c.close();}
});
test('worker voice payload reverse-geocodes a real position without accepting client-supplied addresses',async()=>{
 const c=await client();try{
  const sos=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts:people,location:{...location,address:'invented address'}})).json();await c.app.tick();const claim=await c.app.inject({method:'POST',url:`/internal/attempts/${sos.attempts[0].id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});assert.equal(claim.statusCode,200);assert.ok(claim.json().message.includes('Indian Museum'));assert.ok(!claim.json().message.includes('latitude'));assert.ok(!claim.json().message.includes('invented'));
 }finally{await c.close();}
});
test('opt-in battery SMS demo uses the cloud worker once for one eligible recipient, clearly labels simulation, and makes no calls',async()=>{
 const c=await client();try{
  assert.equal((await c.call('POST','/v1/battery-demo',{contacts:people,deliver_sms:true})).statusCode,409);
  const demo=(await c.call('POST','/v1/battery-demo',{contacts:[people[1]],deliver_sms:true})).json();
  assert.equal((await c.call('POST','/v1/battery-demo',{contacts:[people[1]],deliver_sms:true})).json().id,demo.id);
  c.advance(20001);await c.app.tick();await c.app.tick();assert.equal(c.jobs.length,1);assert.equal(c.jobs[0].channel,'SMS');
  const state=(await c.call('GET',`/v1/battery-demo/${demo.id}`)).json(),sms=state.sms_attempts[0];
  const claim=await c.app.inject({method:'POST',url:`/internal/sms/${sms.id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});assert.equal(claim.statusCode,200);assert.equal(claim.json().to,people[1].phone);assert.ok(claim.json().message.startsWith('DEMO'));assert.ok(claim.json().message.includes('simulated battery and location'));assert.ok(claim.json().message.includes('No emergency'));assert.ok(/^[\x20-\x7e]+$/.test(claim.json().message));assert.ok(claim.json().message.length+40<=160,'include headroom for the Twilio trial banner in one GSM segment');
  assert.equal(c.app.store.list('attempt').length,0);
 }finally{await c.close();}
});
test('closing a real SMS demo cancels unclaimed messages and disabled delivery rejects an SMS demo',async()=>{
 const c=await client();try{
  const demo=(await c.call('POST','/v1/battery-demo',{contacts:[people[0]],deliver_sms:true})).json();c.advance(20001);await c.app.tick();const state=(await c.call('GET',`/v1/battery-demo/${demo.id}`)).json();
  await c.call('DELETE',`/v1/battery-demo/${demo.id}`);const claim=await c.app.inject({method:'POST',url:`/internal/sms/${state.sms_attempts[0].id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});assert.equal(claim.statusCode,409);
 }finally{await c.close();}
 const disabled=await client({LIVE_SMS_ENABLED:'false'});try{assert.equal((await disabled.call('POST','/v1/battery-demo',{contacts:[people[0]],deliver_sms:true})).statusCode,409);}finally{await disabled.close();}
});
test('fresh GPS proves the phone is reporting, while a delayed old fix cannot postpone a battery alert',async()=>{
 const c=await client();try{
  await c.heartbeat({location:undefined});c.advance(299000);
  const fix={...location,timestamp_ms:c.at,sequence:1};assert.equal((await c.call('POST',`/v1/trips/${c.trip.id}/locations`,fix)).statusCode,200);c.advance(2000);await c.app.tick();assert.equal(c.jobs.length,0);
  c.advance(297001);await c.app.tick();assert.equal(c.jobs.length,0);c.advance(1000);await c.app.tick();assert.equal(c.jobs.length,2);
 }finally{await c.close();}
 const delayed=await client();try{
  await delayed.heartbeat();delayed.advance(299000);assert.equal((await delayed.call('POST',`/v1/trips/${delayed.trip.id}/locations`,{...location,sequence:1})).statusCode,200);delayed.advance(1001);await delayed.app.tick();assert.equal(delayed.jobs.length,2);
 }finally{await delayed.close();}
});
