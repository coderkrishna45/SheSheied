import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {Store} from '../src/store.js';
import {parseOrs,searchPlaces} from '../src/providers.js';
async function client(options={}){
 let time=Date.parse('2026-10-01T12:00:00Z');const app=buildApp({disableWorker:true,now:()=>time,...options});
 const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();
 let sequence=0;
 const call=(method,url,payload,key)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+session.session_token,'idempotency-key':key||'cmd-'+sequence++}});
 const plan=(await call('POST','/v1/plans',{mode:'REHEARSAL',recorded_scenario:true})).json();
 const trip=(await call('POST','/v1/trips',{plan_id:plan.id,route_id:plan.routes[0].route_id,contacts:[]})).json();
 return {app,call,plan,trip,sessionToken:session.session_token,advance:n=>{time+=n;}};
}
test('rehearsal persists real road geometry and immutable endpoints; command replay is idempotent',async()=>{
 const c=await client();try{
 assert.ok(c.trip.route.geometry.length>30);assert.equal(c.trip.destination.label,c.plan.destination.label);
 const first=await c.call('POST','/v1/sos',{trip_id:c.trip.id},'sos-one');const repeat=await c.call('POST','/v1/sos',{trip_id:c.trip.id},'sos-one');
 assert.equal(first.json().id,repeat.json().id);assert.equal(c.app.store.list('sos').length,1);
 assert.equal((await c.call('POST','/v1/sos',{trip_id:c.trip.id,trigger:'TIMEOUT'},'sos-one')).statusCode,409);
 }finally{await c.app.close();}
});
test('segment check-in survives screen absence and timeout produces one incident',async()=>{
 const c=await client();try{
 const seg=c.trip.route.segments.find(s=>s.risk_level==='HIGH'),p=c.trip.route.geometry[seg.start_index];
 const fix={latitude:p[1],longitude:p[0],timestamp_ms:Date.parse('2026-10-01T12:00:00Z'),accuracy_meters:5,sequence:1};
 await c.call('POST',`/v1/trips/${c.trip.id}/locations`,fix);
 const r=await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'risk-1',segment_id:seg.segment_id});assert.equal(r.json().state,'CHECK_IN_PENDING');
 c.advance(21000);await c.app.tick();await c.app.tick();assert.equal(c.app.store.list('sos').length,1);
 c.advance(7000);await c.app.tick();c.advance(7000);await c.app.tick();
 assert.equal(c.app.store.list('sos')[0].status,'ACKNOWLEDGED');assert.equal(c.app.store.list('attempt').length,2);
 }finally{await c.app.close();}
});
test('safe acknowledgement prevents expiration, end prevents new SOS, unauthorized access fails',async()=>{
 const c=await client();try{
 const seg=c.trip.route.segments.find(s=>s.risk_level==='HIGH'),p=c.trip.route.geometry[seg.start_index];
 await c.call('POST',`/v1/trips/${c.trip.id}/locations`,{latitude:p[1],longitude:p[0],timestamp_ms:Date.parse('2026-10-01T12:00:00Z'),accuracy_meters:5,sequence:1});
 await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'check',segment_id:seg.segment_id});
 await c.call('POST',`/v1/trips/${c.trip.id}/check-ins/check/resolve`,{status:'SAFE'});c.advance(30000);await c.app.tick();assert.equal(c.app.store.list('sos').length,0);
 await c.call('POST',`/v1/trips/${c.trip.id}/end`,{});assert.equal((await c.call('POST','/v1/sos',{trip_id:c.trip.id})).statusCode,409);
 assert.equal((await c.app.inject({url:`/v1/trips/${c.trip.id}`})).statusCode,401);
 }finally{await c.app.close();}
});
test('standalone SOS works without a trip; unconfigured live delivery never claims success',async()=>{
 const c=await client();try{
 const r=await c.call('POST','/v1/sos',{mode:'LIVE',contacts:[{name:'Test',phone:'+919999999999'}]});assert.equal(r.statusCode,200);assert.equal(r.json().status,'UNAVAILABLE');
 const x=await c.call('POST',`/v1/sos/${r.json().id}/cancel`,{});assert.equal(x.json().status,'CANCELLED');
 assert.equal((await c.app.inject({method:'POST',url:'/v1/provider/twilio/status?attempt_id=bad',payload:{CallStatus:'completed'}})).statusCode,403);
 }finally{await c.app.close();}
});
test('a second installation cannot read another installation trip',async()=>{
 const c=await client();try{const s=(await c.app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();assert.equal((await c.app.inject({url:`/v1/trips/${c.trip.id}`,headers:{authorization:'Bearer '+s.session_token}})).statusCode,404);}finally{await c.app.close();}
});
test('GeoJSON parser rejects reversed or distant geometry and accepts one provider route',()=>{
 const r={features:[{geometry:{type:'LineString',coordinates:[[88.35,22.56],[88.34,22.55]]},properties:{summary:{duration:1200,distance:1800},segments:[]}}]};
 const parsed=parseOrs(r,[88.35,22.56],[88.34,22.55]);assert.equal(parsed.length,1);assert.equal(parsed[0].origin_snap_meters,0);assert.equal(parsed[0].destination_snap_meters,0);
 assert.throws(()=>parseOrs(r,[0,0],[1,1]));
 assert.throws(()=>parseOrs(r,[88.35,22.563],[88.34,22.55]),e=>e.code==='ENDPOINT_TOO_FAR');
 assert.throws(()=>parseOrs(r,[88.35,22.56],[88.34,22.553]),e=>e.code==='ENDPOINT_TOO_FAR');
 const invalid=structuredClone(r);invalid.features[0].properties.summary.distance=Infinity;assert.throws(()=>parseOrs(invalid,[88.35,22.56],[88.34,22.55]),e=>e.code==='INVALID_GEOMETRY');
 const duplicate=structuredClone(r);duplicate.features.push(duplicate.features[0]);assert.equal(parseOrs(duplicate,[88.35,22.56],[88.34,22.55]).length,1);
});
test('Kolkata search excludes distant and malformed results and uses bounded fallback for missing landmarks',async()=>{
 const requests=[];const request=async url=>{requests.push(new URL(url));return requests.length===1?{features:[{properties:{label:'Delhi museum'},geometry:{coordinates:[77.2,28.6]}},{properties:{label:'Banking Museum, Kolkata'},geometry:{coordinates:[88.35,22.56]}},{properties:{label:'Invalid'}}]}:[{place_id:1,display_name:'Indian Museum, Kolkata',lat:'22.5578',lon:'88.3512'},{place_id:2,display_name:'Wrong city',lat:'28.6',lon:'77.2'}];};
 const places=await searchPlaces('Indian Museum Kolkata','test-key',request);assert.equal(places.length,1);assert.equal(places[0].label,'Indian Museum, Kolkata');
 assert.equal(requests[0].searchParams.get('boundary.rect.min_lon'),'88.15');assert.equal(requests[1].searchParams.get('bounded'),'1');
 const primary=await searchPlaces('Esplanade','test-key',async()=>({features:[{properties:{id:'e',label:'Esplanade, Kolkata'},geometry:{coordinates:[88.351,22.5641]}}]}));assert.equal(primary.length,1);
});
test('store transactions roll back failed commands',()=>{const s=new Store();assert.throws(()=>s.transaction(()=>{s.put('test',{id:'a',owner:'o'});throw Error('fail');}));assert.equal(s.get('test','a'),null);s.close();});

test('signed Twilio callbacks are monotonic, duplicate-safe, and late acknowledgement stops the next queued contact',async()=>{
 const {createHmac}=await import('node:crypto');
 const c=await client({config:{LIVE_ALERTS_ENABLED:'true',N8N_WEBHOOK_URL:'https://n8n.example/webhook',WORKER_TOKEN:'worker',PUBLIC_BASE_URL:'https://api.example',TWILIO_AUTH_TOKEN:'test-token',TEST_RECIPIENT_ALLOWLIST:'+919999999999,+918888888888'}});
 try{
  const incident=(await c.call('POST','/v1/sos',{mode:'LIVE',contacts:[{name:'One',phone:'+919999999999'},{name:'Two',phone:'+918888888888'}]})).json();
  const attempt=c.app.store.get('attempt',incident.attempt_ids[0]);attempt.status='DISPATCHING';c.app.store.put('attempt',attempt);
  const claim=()=>c.app.inject({method:'POST',url:`/internal/attempts/${attempt.id}/claim`,headers:{'x-worker-token':'worker'},payload:{}});
  assert.equal((await claim()).statusCode,200);assert.equal((await claim()).statusCode,409);
  await c.app.inject({method:'POST',url:`/internal/attempts/${attempt.id}/result`,headers:{'x-worker-token':'worker'},payload:{outcome_unknown:true}});
  assert.equal(c.app.store.get('attempt',attempt.id).status,'REQUEST_UNKNOWN');assert.equal(c.app.store.list('attempt').length,1);
  async function callback(endpoint,payload){const url=`/v1/provider/twilio/${endpoint}?attempt_id=${attempt.id}`;const input='https://api.example'+url+Object.keys(payload).sort().map(k=>k+payload[k]).join('');return c.app.inject({method:'POST',url,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':createHmac('sha1','test-token').update(input).digest('base64')},payload:new URLSearchParams(payload).toString()});}
  const sid='CA'+'a'.repeat(32);
  await callback('status',{CallStatus:'ringing',CallSid:sid});await callback('status',{CallStatus:'initiated',CallSid:sid});assert.equal(c.app.store.get('attempt',attempt.id).status,'RINGING');
  await callback('status',{CallStatus:'no-answer',CallSid:sid});await callback('status',{CallStatus:'no-answer',CallSid:sid});assert.equal(c.app.store.list('attempt').length,2);
  await callback('ack',{Digits:'1',CallSid:sid});assert.equal(c.app.store.get('sos',incident.id).status,'ACKNOWLEDGED');assert.equal(c.app.store.list('attempt')[1].status,'CANCELLED');
  const bad=await c.app.inject({method:'POST',url:`/v1/provider/twilio/ack?attempt_id=${attempt.id}`,headers:{'x-twilio-signature':'bad'},payload:{Digits:'1',CallSid:sid}});assert.equal(bad.statusCode,403);
 }finally{await c.app.close();}
});

test('durable SQLite survives API restart and restores the selected route and deadline',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'sheshield-store-')),file=join(dir,'state.sqlite');let app;
 try{const first=new Store(file);first.put('trip',{id:'saved',owner:'installation',state:'CHECK_IN_PENDING',route:{geometry:[[88.35,22.56],[88.34,22.55]]},check_in:{deadline_ms:12345}});first.close();const second=new Store(file);app=buildApp({store:second,disableWorker:true});assert.equal(app.store.get('trip','saved').check_in.deadline_ms,12345);assert.equal(app.store.get('trip','saved').route.geometry.length,2);await app.close();second.close();app=null;}finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('companion links accept an older client empty binary POST and the current JSON request',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
  const session=(await c.app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();
  const headers={'content-type':'application/octet-stream','content-length':'0'};
  const url=`/v1/trips/${c.trip.id}/share`;
  assert.equal((await c.app.inject({method:'POST',url,headers})).statusCode,401);
  assert.equal((await c.app.inject({method:'POST',url,headers:{...headers,authorization:'Bearer '+session.session_token}})).statusCode,404);
  const ownedHeaders={...headers,authorization:'Bearer '+c.sessionToken};
  const legacy=await c.app.inject({method:'POST',url,headers:ownedHeaders});
  assert.equal(legacy.statusCode,200);
  assert.equal((await c.app.inject({url:new URL(legacy.json().url).pathname+'/data'})).statusCode,200);
  assert.equal((await c.call('POST',url,{})).statusCode,200);
  await c.call('POST',`/v1/trips/${c.trip.id}/end`,{});
  assert.equal((await c.app.inject({method:'POST',url,headers:ownedHeaders})).statusCode,409);
 }finally{await c.app.close();}
});

test('sharing compatibility rejects nonempty unsupported bodies and does not change other endpoints',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
  const before=c.app.store.list('share').length;
  const headers={'content-type':'application/octet-stream'};
  assert.equal((await c.app.inject({method:'POST',url:`/v1/trips/${c.trip.id}/share`,headers,payload:'unexpected'})).statusCode,415);
  assert.equal((await c.app.inject({method:'POST',url:'/v1/plans',headers:{...headers,'content-length':'0'}})).statusCode,415);
  assert.equal(c.app.store.list('share').length,before);
 }finally{await c.app.close();}
});

test('invalid GPS fixes and expired share links fail explicitly',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
 assert.equal((await c.call('POST',`/v1/trips/${c.trip.id}/locations`,{latitude:22.56,longitude:88.35,timestamp_ms:0,sequence:1,accuracy_meters:5})).statusCode,400);
 const share=(await c.call('POST',`/v1/trips/${c.trip.id}/share`,{})).json();const path=new URL(share.url).pathname+'/data';assert.equal((await c.app.inject({url:path})).statusCode,200);c.advance(7200001);assert.equal((await c.app.inject({url:path})).statusCode,410);
 }finally{await c.app.close();}
});

test('a timely offline SAFE acknowledgement cancels future timeout escalation after reconnect',async()=>{
 const c=await client();try{
 const seg=c.trip.route.segments.find(s=>s.risk_level==='HIGH'),p=c.trip.route.geometry[seg.start_index];
 await c.call('POST',`/v1/trips/${c.trip.id}/locations`,{latitude:p[1],longitude:p[0],timestamp_ms:Date.parse('2026-10-01T12:00:00Z'),accuracy_meters:5,sequence:1});
 await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'offline-safe',segment_id:seg.segment_id});
 const acknowledgedAt=Date.parse('2026-10-01T12:00:10Z');c.advance(21000);await c.app.tick();assert.equal(c.app.store.get('trip',c.trip.id).state,'SOS_ACTIVE');
 const response=await c.call('POST',`/v1/trips/${c.trip.id}/check-ins/offline-safe/resolve`,{status:'SAFE',resolved_at_ms:acknowledgedAt});assert.equal(response.json().state,'ACTIVE');assert.equal(c.app.store.list('sos')[0].cancelled,true);c.advance(30000);await c.app.tick();assert.equal(c.app.store.list('attempt').length,1);
 }finally{await c.app.close();}
});

test('editable practice routes honor changed endpoints; only an explicit recorded scenario uses fixed Kolkata geometry',async()=>{
 const calls=[];const provider=async(origin,destination)=>{calls.push([origin,destination]);return [{route_id:'route-0',geometry:[origin,[(origin[0]+destination[0])/2,(origin[1]+destination[1])/2],destination],duration_seconds:600,distance_meters:800,steps:[]}];};
 const c=await client({routeLive:provider});try{
 const origin={label:'Park Street',latitude:22.5521,longitude:88.3526},destination={label:'Indian Museum',latitude:22.5578,longitude:88.3512};
 const a=(await c.call('POST','/v1/plans',{mode:'REHEARSAL',origin,destination})).json();
 const changed={label:'Howrah Bridge',latitude:22.5851,longitude:88.3468};
 const b=(await c.call('POST','/v1/plans',{mode:'REHEARSAL',origin:changed,destination})).json();
 assert.equal(calls.length,2);assert.deepEqual(a.routes[0].geometry[0],[origin.longitude,origin.latitude]);assert.deepEqual(b.routes[0].geometry[0],[changed.longitude,changed.latitude]);assert.notDeepEqual(a.routes[0].geometry,b.routes[0].geometry);assert.equal(b.routes[0].is_demo_data,false);assert.equal(b.routes[0].coverage,'UNAVAILABLE');
 assert.equal((await c.call('POST','/v1/plans',{mode:'REHEARSAL'})).statusCode,400);
 }finally{await c.app.close();}
});

test('personal watch works without incident evidence or GPS; server expires it after the phone disconnects',async()=>{
 const c=await client();try{
 const saved=c.app.store.get('trip',c.trip.id);saved.route.segments.forEach(s=>s.risk_level='UNKNOWN');c.app.store.put('trip',saved);
 const path=`/v1/trips/${c.trip.id}/check-ins`,body={event_id:'watch-no-data',kind:'PERSONAL',window_seconds:120};
 const a=await c.call('POST',path,body,'watch-command');const b=await c.call('POST',path,body,'watch-command');
 assert.equal(a.statusCode,200);assert.equal(a.json().check_in.id,b.json().check_in.id);assert.equal(a.json().last_location,null);
 c.advance(121000);await c.app.tick();await c.app.tick();assert.equal(c.app.store.list('sos').length,1);assert.equal(c.app.store.get('trip',c.trip.id).state,'SOS_ACTIVE');
 }finally{await c.app.close();}
});
test('personal watch validates window and cannot overwrite an existing deadline',async()=>{
 const c=await client();try{
 const path=`/v1/trips/${c.trip.id}/check-ins`;
 for(const seconds of [-1,0,1801,'120',NaN])assert.equal((await c.call('POST',path,{kind:'PERSONAL',window_seconds:seconds})).statusCode,400);
 const first=(await c.call('POST',path,{event_id:'first',kind:'PERSONAL',window_seconds:120})).json();
 const second=(await c.call('POST',path,{event_id:'second',kind:'PERSONAL',window_seconds:1800})).json();
 assert.equal(second.check_in.id,'first');assert.equal(second.check_in.deadline_ms,first.check_in.deadline_ms);
 }finally{await c.app.close();}
});
test('companion acknowledgement is idempotent, never resolves safety, and links can be revoked',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
 await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'watch-companion',kind:'PERSONAL',window_seconds:120});
 const shared=(await c.call('POST',`/v1/trips/${c.trip.id}/share`,{})).json(),path=new URL(shared.url).pathname;
 const ack=()=>c.app.inject({method:'POST',url:path+'/companion',payload:{event_id:'watch-companion',status:'SAFE'}});
 const a=await ack();c.advance(1000);const b=await ack();assert.equal(a.json().at_ms,b.json().at_ms);
 const trip=c.app.store.get('trip',c.trip.id);assert.equal(trip.state,'CHECK_IN_PENDING');assert.equal(trip.check_in.status,'PENDING');
 assert.equal((await c.app.inject({method:'POST',url:path+'/companion',payload:{event_id:'wrong'}})).statusCode,409);
 await c.call('DELETE',`/v1/trips/${c.trip.id}/share`);assert.equal((await ack()).statusCode,410);assert.equal((await c.app.inject({url:path+'/data'})).statusCode,410);
 c.advance(121000);await c.app.tick();assert.equal(c.app.store.list('sos').length,1);
 }finally{await c.app.close();}
});
test('ending a journey immediately closes companion location sharing and cancels its watch',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
 await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{kind:'PERSONAL',window_seconds:120});
 const link=(await c.call('POST',`/v1/trips/${c.trip.id}/share`,{})).json();
 await c.call('POST',`/v1/trips/${c.trip.id}/end`,{});c.advance(121000);await c.app.tick();assert.equal(c.app.store.list('sos').length,0);
 assert.equal((await c.app.inject({url:new URL(link.url).pathname+'/data'})).statusCode,410);
 }finally{await c.app.close();}
});
test('live personal watch exposes unavailable delivery instead of promising contact calls',async()=>{
 const c=await client();try{
 const t=c.app.store.get('trip',c.trip.id);t.mode='LIVE';c.app.store.put('trip',t);
 const result=await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'watch-live',kind:'PERSONAL',window_seconds:120});
 assert.equal(result.statusCode,200);assert.equal(result.json().check_in.delivery_ready,false);assert.equal(result.json().check_in.eligible_contacts,0);
 c.advance(121000);await c.app.tick();assert.equal(c.app.store.list('sos')[0].status,'NO_CONTACTS');
 }finally{await c.app.close();}
});

test('a registered personal watch survives a process restart and expires exactly once',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'watch-restart-')),file=join(dir,'watch.sqlite');let time=Date.parse('2026-10-01T12:00:00Z');let app;
 try{
  const c=await client({config:{DATABASE_PATH:file},now:()=>time});app=c.app;
  await c.call('POST',`/v1/trips/${c.trip.id}/check-ins`,{event_id:'watch-restart',kind:'PERSONAL',window_seconds:120});
  const deadline=app.store.get('trip',c.trip.id).check_in.deadline_ms;
  await app.close();app=buildApp({disableWorker:true,config:{DATABASE_PATH:file},now:()=>time});
  assert.equal(app.store.get('trip',c.trip.id).check_in.deadline_ms,deadline);
  time+=121000;await app.tick();await app.tick();assert.equal(app.store.list('sos').length,1);
  assert.equal(app.store.get('trip',c.trip.id).state,'SOS_ACTIVE');
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('a companion acknowledgement from a previous watch cannot acknowledge the next one',async()=>{
 const c=await client({config:{PUBLIC_BASE_URL:'https://api.example'}});try{
 const path=`/v1/trips/${c.trip.id}/check-ins`;
 await c.call('POST',path,{event_id:'one',kind:'PERSONAL',window_seconds:120});
 const link=(await c.call('POST',`/v1/trips/${c.trip.id}/share`,{})).json();const companion=new URL(link.url).pathname+'/companion';
 await c.call('POST',path+'/one/resolve',{status:'SAFE'});
 await c.call('POST',path,{event_id:'two',kind:'PERSONAL',window_seconds:120});
 assert.equal((await c.app.inject({method:'POST',url:companion,payload:{event_id:'one'}})).statusCode,409);
 assert.equal(c.app.store.get('trip',c.trip.id).check_in.companion_seen_at_ms,null);
 }finally{await c.app.close();}
});

test('an unavailable first contact does not prevent escalation to a configured later contact',async()=>{
 const c=await client({config:{LIVE_ALERTS_ENABLED:'true',N8N_WEBHOOK_URL:'https://n8n.example/webhook',WORKER_TOKEN:'worker',PUBLIC_BASE_URL:'https://api.example',TWILIO_AUTH_TOKEN:'test-token',TEST_RECIPIENT_ALLOWLIST:'+918888888888'}});
 try{
  const result=await c.call('POST','/v1/sos',{mode:'LIVE',contacts:[{name:'Unavailable first',phone:'+919999999999'},{name:'Configured second',phone:'+918888888888'}]});
  assert.equal(result.json().status,'CONTACTING');
  assert.deepEqual(result.json().attempts.map(a=>a.status),['UNAVAILABLE','QUEUED']);
  assert.equal(result.json().attempts[1].contact.name,'Configured second');
  assert.equal(c.app.store.list('attempt').length,2);
 }finally{await c.app.close();}
});
