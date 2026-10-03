import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {trialRecipientRegistry,deliveryAvailability} from '../src/delivery.js';
const contacts=[{name:'One',phone:'+919999999999'},{name:'Two',phone:'+918888888888'}];
const config={LIVE_ALERTS_ENABLED:'true',LIVE_SMS_ENABLED:'true',N8N_WEBHOOK_URL:'https://cloud.example/webhook',WORKER_TOKEN:'worker',PUBLIC_BASE_URL:'https://api.example',TWILIO_AUTH_TOKEN:'token',TEST_RECIPIENT_ALLOWLIST:contacts.map(c=>c.phone).join(',')};
async function client(overrides={}){
 const jobs=[];const app=buildApp({disableWorker:true,config:{...config,...overrides},dispatch:async(u,o)=>{jobs.push(JSON.parse(o.body));return {ok:true};}});
 const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();let n=0;
 const call=(method,url,payload,key)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+session.session_token,'idempotency-key':key||'cmd-'+n++}});
 app.store.put('trip',{id:'trip',owner:session.installation_id,mode:'LIVE',state:'CHECK_IN_PENDING',contacts,route:{geometry:[[88.35,22.56],[88.36,22.57]]},destination:{label:'Destination'},check_in:{id:'watch',status:'PENDING',deadline_ms:Date.now()+300000},version:1});
 const worker=(url,payload={})=>app.inject({method:'POST',url,payload,headers:{'x-worker-token':'worker'}});
 return {app,call,worker,jobs};
}
test('companion SMS chooses exactly one recipient, survives replay and reports signed delivery without resolving the watch',async()=>{
 const c=await client();try{
  const before=c.app.store.get('trip','trip');const request={contact:contacts[1]};
  const sent=(await c.call('POST','/v1/trips/trip/companion-sms',request,'send-once')).json();assert.equal(sent.status,'QUEUED');
  assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',request,'send-once')).json().id,sent.id);
  assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',request)).json().id,sent.id);
  assert.equal(c.app.store.list('sms_attempt').length,1);await c.app.tick();await c.app.tick();assert.equal(c.jobs.length,1);assert.equal(c.jobs[0].channel,'SMS');
  const claim=await c.worker(`/internal/sms/${sent.id}/claim`);assert.equal(claim.statusCode,200);assert.equal(claim.json().to,contacts[1].phone);
  const link=claim.json().message.match(/https:\/\/api.example\/share\/([a-f0-9]+)/)[1];assert.equal((await c.app.inject({url:`/share/${link}/data`})).statusCode,200);
  assert.equal((await c.worker(`/internal/sms/${sent.id}/claim`)).statusCode,409);
  const body={MessageSid:'SM'+'a'.repeat(32),MessageStatus:'delivered'},url=`/v1/provider/twilio/sms-status?attempt_id=${sent.id}`;
  const signature=createHmac('sha1',config.TWILIO_AUTH_TOKEN).update(config.PUBLIC_BASE_URL+url+Object.keys(body).sort().map(k=>k+body[k]).join('')).digest('base64');
  assert.equal((await c.app.inject({method:'POST',url,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},payload:new URLSearchParams(body).toString()})).statusCode,200);
  assert.equal((await c.call('GET',`/v1/companion-sms/${sent.id}`)).json().status,'DELIVERED');
  assert.deepEqual(c.app.store.get('trip','trip'),before);assert.equal(c.app.store.list('sos').length,0);
  await c.call('DELETE','/v1/trips/trip/share');assert.equal((await c.app.inject({url:`/share/${link}/data`})).statusCode,410);
 }finally{await c.app.close();}
});
test('ended journeys, unconfigured recipients, practice and link revocation cannot queue live companion SMS',async()=>{
 const c=await client();try{
  assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',{contact:{name:'Other',phone:'+917777777777'}})).statusCode,409);
  assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',{})).statusCode,400);
  const t=c.app.store.get('trip','trip');t.mode='REHEARSAL';c.app.store.put('trip',t);assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',{contact:contacts[0]})).statusCode,409);
  t.mode='LIVE';c.app.store.put('trip',t);await c.call('POST','/v1/trips/trip/companion-sms',{contact:contacts[0]});await c.call('DELETE','/v1/trips/trip/share');await c.app.tick();assert.equal(c.jobs.length,0);assert.equal(c.app.store.list('sms_attempt')[0].status,'CANCELLED');
  t.state='COMPLETED';c.app.store.put('trip',t);assert.equal((await c.call('POST','/v1/trips/trip/companion-sms',{contact:contacts[1]})).statusCode,409);
  assert.equal((await c.app.inject({url:'/v1/companion-sms/anything'})).statusCode,401);
 }finally{await c.app.close();}
});
test('Circle changes update future journey alerts without changing an existing SOS or pending deadline',async()=>{
 const c=await client();try{
  const before=c.app.store.get('trip','trip');const updated=(await c.call('POST','/v1/trips/trip/contacts',{contacts:[contacts[1]]})).json();assert.deepEqual(updated.check_in,before.check_in);
  const first=(await c.call('POST','/v1/sos',{trip_id:'trip'})).json();assert.deepEqual(first.contacts,[contacts[1]]);
  await c.call('POST','/v1/trips/trip/contacts',{contacts});assert.deepEqual(c.app.store.get('sos',first.id).contacts,[contacts[1]]);
  await c.call('POST',`/v1/sos/${first.id}/cancel`,{});const next=(await c.call('POST','/v1/sos',{trip_id:'trip'})).json();assert.equal(next.sms_attempts.length,2);
 }finally{await c.app.close();}
});
test('trial recipient sync only enables verified IDs on an active Trial account and keeps explicit paid allowlists',async()=>{
 for(const type of ['Trial','Full']){
  const cfg={...config,TEST_RECIPIENT_ALLOWLIST:contacts[0].phone,TRIAL_SYNC_VERIFIED_RECIPIENTS:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32)};let requests=0;
  const registry=trialRecipientRegistry(cfg,{fetcher:async url=>{requests++;return {ok:true,json:async()=>url.endsWith('.json')?{type,status:'active'}:{outgoing_caller_ids:contacts.map(c=>({phone_number:c.phone}))}};}});
  await registry.refresh();await registry.refresh();assert.equal(requests,type==='Trial'?2:1);
  assert.equal(deliveryAvailability(cfg,contacts[1]).sms_configured,type==='Trial');assert.equal(deliveryAvailability(cfg,contacts[0]).voice_configured,true);
  assert.equal(deliveryAvailability(cfg,{phone:'+917777777777'}).sms_configured,false);
 }
});
