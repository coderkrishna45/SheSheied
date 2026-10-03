import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildApp} from '../src/app.js';

const config={LIVE_ALERTS_ENABLED:'true',LIVE_SMS_ENABLED:'true',N8N_WEBHOOK_URL:'https://cloud.example/webhook/sheshield-delivery',WORKER_TOKEN:'worker',PUBLIC_BASE_URL:'https://api.example',TWILIO_AUTH_TOKEN:'test-token',TEST_RECIPIENT_ALLOWLIST:'+919999999999,+918888888888'};
const contacts=[{name:'One',phone:'+919999999999'},{name:'Two',phone:'+918888888888'}];
async function client(overrides={},dispatch=async()=>({ok:true})){
 const app=buildApp({disableWorker:true,config:{...config,...overrides},dispatch});
 const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();let counter=0;
 const call=(method,url,payload,key)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+session.session_token,'idempotency-key':key||'cmd-'+counter++}});
 const worker=(url,payload={})=>app.inject({method:'POST',url,headers:{'x-worker-token':'worker'},payload});
 function callback(attempt,payload,signature){const url=`/v1/provider/twilio/sms-status?attempt_id=${attempt}`;const input=config.PUBLIC_BASE_URL+url+Object.keys(payload).sort().map(k=>k+payload[k]).join('');return app.inject({method:'POST',url,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature||createHmac('sha1',config.TWILIO_AUTH_TOKEN).update(input).digest('base64')},payload:new URLSearchParams(payload).toString()});}
 return {app,call,worker,callback};
}
test('cloud SMS queues once per contact and command replay does not duplicate requests',async()=>{
 const jobs=[];const c=await client({},async(url,options)=>{jobs.push(JSON.parse(options.body));return {ok:true};});
 try{const body={mode:'LIVE',contacts};const first=(await c.call('POST','/v1/sos',body,'sos')).json();const repeat=(await c.call('POST','/v1/sos',body,'sos')).json();assert.equal(first.id,repeat.id);assert.equal(first.sms_attempts.length,2);
  await c.app.tick();await c.app.tick();assert.equal(jobs.filter(j=>j.channel==='SMS').length,2);assert.equal(jobs.filter(j=>!j.channel).length,1);
  const voiceClaim=await c.worker(`/internal/attempts/${first.attempts[0].id}/claim`);assert.equal(voiceClaim.statusCode,200);assert.ok(!/location|latitude|longitude|unavailable|error/i.test(voiceClaim.json().message));assert.ok(voiceClaim.json().message.includes('Press 1'));
  const sms=first.sms_attempts[0];const claim=await c.worker(`/internal/sms/${sms.id}/claim`);assert.equal(claim.statusCode,200);assert.ok(claim.json().message.includes('No location was shared'));assert.equal(claim.json().to,contacts[0].phone);assert.equal((await c.worker(`/internal/sms/${sms.id}/claim`)).statusCode,409);
  const sid='SM'+'a'.repeat(32);assert.equal((await c.worker(`/internal/sms/${sms.id}/result`,{message_sid:sid})).statusCode,200);
  assert.equal((await c.callback(sms.id,{MessageSid:sid,MessageStatus:'sent'})).statusCode,200);assert.equal(c.app.store.get('sms_attempt',sms.id).status,'SENT');
  await c.callback(sms.id,{MessageSid:sid,MessageStatus:'queued'});assert.equal(c.app.store.get('sms_attempt',sms.id).status,'SENT');
  await c.callback(sms.id,{MessageSid:sid,MessageStatus:'delivered'});await c.callback(sms.id,{MessageSid:sid,MessageStatus:'failed'});assert.equal(c.app.store.get('sms_attempt',sms.id).status,'DELIVERED');assert.notEqual(c.app.store.get('sos',first.id).status,'ACKNOWLEDGED');
  assert.equal((await c.callback(sms.id,{MessageSid:'SM'+'b'.repeat(32),MessageStatus:'delivered'})).statusCode,400);
  assert.equal((await c.callback(sms.id,{MessageSid:sid,MessageStatus:'delivered'},'invalid')).statusCode,403);
 }finally{await c.app.close();}
});
test('disabled cloud SMS, missing callbacks and unapproved recipients never dispatch a text',async()=>{
 for(const overrides of [{LIVE_SMS_ENABLED:'false'},{LIVE_ALERTS_ENABLED:'false'},{TWILIO_AUTH_TOKEN:''},{TEST_RECIPIENT_ALLOWLIST:''}]){
  const jobs=[];const c=await client(overrides,async(url,options)=>{jobs.push(JSON.parse(options.body));return {ok:true};});
  try{const incident=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts})).json();assert.ok(incident.sms_attempts.every(s=>s.status==='UNAVAILABLE'));await c.app.tick();assert.equal(jobs.filter(j=>j.channel==='SMS').length,0);}finally{await c.app.close();}
 }
});
test('SMS cancellation prevents queued delivery; an uncertain dispatch is never blindly repeated',async()=>{
 const jobs=[];const c=await client({},async(url,options)=>{const job=JSON.parse(options.body);jobs.push(job);if(job.channel==='SMS')throw Error('lost response');return {ok:true};});
 try{const first=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts})).json();await c.call('POST',`/v1/sos/${first.id}/cancel`,{});await c.app.tick();assert.equal(jobs.length,0);assert.ok(c.app.store.list('sms_attempt').every(s=>s.status==='CANCELLED'));
  const next=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts})).json();await c.app.tick();await c.app.tick();assert.equal(jobs.filter(j=>j.channel==='SMS').length,2);assert.ok(next.sms_attempts.every(s=>c.app.store.get('sms_attempt',s.id).status==='REQUEST_UNKNOWN'));
 }finally{await c.app.close();}
});
test('SMS claimed before cancellation can still report delivery without acknowledging safety',async()=>{
 const c=await client();try{const incident=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts})).json();await c.app.tick();const sms=incident.sms_attempts[0];await c.worker(`/internal/sms/${sms.id}/claim`);await c.call('POST',`/v1/sos/${incident.id}/cancel`,{});
  await c.callback(sms.id,{MessageSid:'SM'+'c'.repeat(32),MessageStatus:'delivered'});assert.equal(c.app.store.get('sms_attempt',sms.id).status,'DELIVERED');assert.equal(c.app.store.get('sos',incident.id).status,'CANCELLED');
 }finally{await c.app.close();}
});
test('n8n Cloud worker has separate voice and SMS branches and builds valid encoded SMS fields',()=>{
 const workflow=JSON.parse(readFileSync(new URL('../../n8n/workflows/04_cloud_delivery_v2.json',import.meta.url)));
 const nodes=Object.fromEntries(workflow.nodes.map(n=>[n.name,n]));assert.equal(nodes['Delivery Job'].parameters.authentication,'headerAuth');assert.equal(workflow.connections['Is SMS Job'].main[0][0].node,'Claim SMS');assert.equal(workflow.connections['Is SMS Job'].main[1][0].node,'Claim Attempt');
 const message='Help & location unavailable.';const build=new Function('$input','$',nodes['Build SMS'].parameters.jsCode);
 const result=build({first:()=>({json:{attempt_id:'test',to:contacts[0].phone,message,callback_url:'https://api.example/status'}})},()=>({first:()=>({json:{from_number:'+12345678901'}})}));const form=new URLSearchParams(result[0].json.form_body);assert.equal(form.get('Body'),message);assert.equal(form.get('To'),contacts[0].phone);assert.equal(form.get('From'),'+12345678901');
 assert.equal(nodes['Send SMS'].parameters.genericAuthType,'httpBasicAuth');assert.equal(nodes['Claim SMS'].parameters.genericAuthType,'httpHeaderAuth');assert.equal(nodes['Record SMS Result'].parameters.genericAuthType,'httpHeaderAuth');
 assert.equal(workflow.settings.saveDataSuccessExecution,'none');
});
test('persisted SMS work is not dispatched after live delivery is disabled on restart',async()=>{
 const jobs=[];const c=await client({LIVE_ALERTS_ENABLED:'false'},async(url,options)=>{jobs.push(options);return {ok:true};});
 try{
  const incident=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts})).json();
  const sms=c.app.store.get('sms_attempt',incident.sms_attempts[0].id);sms.status='QUEUED';c.app.store.put('sms_attempt',sms);
  await c.app.tick();assert.equal(jobs.length,0);assert.equal(c.app.store.get('sms_attempt',sms.id).status,'UNAVAILABLE');
 }finally{await c.app.close();}
});
test('a cloud job accepted without a claim becomes outcome unknown without another request',async()=>{
 let time=Date.now(),requests=0;const app=buildApp({disableWorker:true,now:()=>time,config,dispatch:async()=>{requests++;return {ok:true};}});
 try{
  const s=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();
  const incident=(await app.inject({method:'POST',url:'/v1/sos',headers:{authorization:'Bearer '+s.session_token,'idempotency-key':'watchdog'},payload:{mode:'LIVE',contacts}})).json();
  await app.tick();const before=requests;time+=61000;await app.tick();await app.tick();assert.equal(requests,before);assert.ok(incident.sms_attempts.every(s=>app.store.get('sms_attempt',s.id).status==='REQUEST_UNKNOWN'));assert.equal(app.store.get('attempt',incident.attempt_ids[0]).status,'REQUEST_UNKNOWN');
 }finally{await app.close();}
});
test('queued voice work cannot dispatch after cloud calling is disabled on restart',async()=>{
 const jobs=[];const c=await client({LIVE_ALERTS_ENABLED:'false'},async(u,o)=>{jobs.push(o);return {ok:true};});
 try{
  const incident=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts:[contacts[0]]})).json();
  const attempt=c.app.store.get('attempt',incident.attempts[0].id);attempt.status='QUEUED';c.app.store.put('attempt',attempt);
  await c.app.tick();assert.equal(jobs.length,0);assert.equal(c.app.store.get('attempt',attempt.id).status,'UNAVAILABLE');assert.equal(c.app.store.get('sos',incident.id).status,'UNAVAILABLE');
 }finally{await c.app.close();}
});
