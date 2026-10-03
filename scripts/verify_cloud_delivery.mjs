// Controlled real delivery test. Requires an explicit flag and uses only the
// previously approved owner recipient from the configured test allowlist.
// Goes through the app API and n8n Cloud; never creates Twilio calls directly.
import {randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
if(!process.argv.includes('--send-to-owner')&&!process.argv.includes('--refresh-provider'))throw Error('Use --send-to-owner for real delivery, or --refresh-provider for a read-only recheck.');
const recipients=(process.env.TEST_RECIPIENT_ALLOWLIST||'').split(',').map(s=>s.trim()).filter(p=>p.endsWith('1265'));
if(recipients.length!==1)throw Error('Exactly one approved owner test recipient ending 1265 is required.');
const contact={name:'Delivery test',phone:recipients[0]},base=process.env.PUBLIC_BASE_URL;let token,incident,trip;
const report={at:new Date().toISOString(),recipient_last4:'1265',path:'App API → n8n Cloud → Twilio',sos:null,companion:null,provider:[]};
async function call(method,path,body,key){const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(`API HTTP ${r.status}: ${data.code}`);return data;}
async function provider(resource,id){if(!id)return;const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/${resource}/${id}.json`,{headers:{Authorization:'Basic '+Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64')},signal:AbortSignal.timeout(15000)});const data=await r.json();report.provider.push({resource,http:r.status,status:data.status,error_code:data.error_code??data.code??null,duration:data.duration??null});}
if(process.argv.includes('--refresh-provider')){
 const saved=JSON.parse(readFileSync('artifacts/cloud-delivery-check.json'));
 const {DatabaseSync}=await import('node:sqlite');const {resolve}=await import('node:path');const db=new DatabaseSync(resolve('api',process.env.DATABASE_PATH||'data/sheshield.sqlite'),{readOnly:true});
 const attempts=db.prepare("SELECT data FROM records WHERE kind='attempt'").all().map(r=>JSON.parse(r.data));db.close();
 const exact=attempts.find(a=>a.contact.name==='Delivery test'&&a.contact.phone===contact.phone&&a.created_at_ms>=Date.parse(saved.at)&&a.created_at_ms<Date.parse(saved.at)+120000);
 if(!exact?.provider_id)throw Error('The exact recorded test call could not be identified.');
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls/${exact.provider_id}.json`,{headers:{Authorization:'Basic '+Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64')},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Provider read-only recheck failed.');
 const observed=await response.json();
 saved.provider=saved.provider.filter(p=>p.resource!=='Calls');saved.provider.unshift({resource:'Calls',http:200,status:observed.status,error_code:null,duration:observed.duration});saved.provider_rechecked_at=new Date().toISOString();
 if(observed.status==='completed'&&saved.sos.voice.includes('ACKNOWLEDGED')&&saved.sos.sms.includes('DELIVERED')&&saved.companion.status==='DELIVERED')delete saved.error;
 writeFileSync('artifacts/cloud-delivery-check.json',JSON.stringify(saved,null,2)+'\n');console.log(JSON.stringify({check:'Read-only call completion',status:observed.status,seconds:observed.duration,sms:saved.sos.sms,companion:saved.companion.status,acknowledged:saved.sos.voice.includes('ACKNOWLEDGED')}));process.exit(saved.error?1:0);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 token=(await call('POST','/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE})).session_token;
 const check=await call('POST','/v1/delivery/check',{contacts:[contact]});if(!check.contacts[0].voice_configured||!check.contacts[0].sms_configured)throw Error('Owner recipient is not configured for both channels.');
 incident=await call('POST','/v1/sos',{mode:'LIVE',contacts:[contact]},randomUUID());let old='';
 for(let i=0;i<45;i++){
  const result=await call('GET',`/v1/sos/${incident.id}`);incident=result;
  const statuses={overall:result.status,voice:result.attempts.map(a=>a.status),sms:result.sms_attempts.map(a=>a.status)};
  const current=JSON.stringify(statuses);if(current!==old){console.log('SOS '+current);old=current;}
  report.sos=statuses;
  if(result.attempts.every(a=>['ACKNOWLEDGED','COMPLETED_UNCONFIRMED','NO_ANSWER','BUSY','FAILED','UNAVAILABLE','REQUEST_UNKNOWN'].includes(a.status))&&result.sms_attempts.every(a=>['DELIVERED','UNDELIVERED','FAILED','UNAVAILABLE','REQUEST_UNKNOWN'].includes(a.status)))break;
  await sleep(2000);
 }
 for(const a of incident.attempts)await provider('Calls',a.provider_id);
 for(const a of incident.sms_attempts)await provider('Messages',a.provider_id);
 await call('POST',`/v1/sos/${incident.id}/cancel`,{},randomUUID());
 const plan=await call('POST','/v1/plans',{mode:'LIVE',origin:{label:'Esplanade test journey',latitude:22.5641,longitude:88.351},destination:{label:'Victoria Memorial test journey',latitude:22.5448,longitude:88.3426}});
 trip=await call('POST','/v1/trips',{plan_id:plan.id,route_id:plan.routes[0].route_id,contacts:[contact]},randomUUID());
 let message=await call('POST',`/v1/trips/${trip.id}/companion-sms`,{contact},randomUUID());old='';
 for(let i=0;i<30;i++){
  message=await call('GET',`/v1/companion-sms/${message.id}`);if(message.status!==old){console.log('Companion SMS '+message.status);old=message.status;}report.companion={status:message.status};
  if(['DELIVERED','FAILED','UNDELIVERED','CANCELLED','REQUEST_UNKNOWN'].includes(message.status))break;
  await sleep(2000);
 }
 const {DatabaseSync}=await import('node:sqlite');const {resolve}=await import('node:path');const db=new DatabaseSync(resolve('api',process.env.DATABASE_PATH||'data/sheshield.sqlite'),{readOnly:true});
 const row=db.prepare("SELECT data FROM records WHERE kind='sms_attempt' AND id=?").get(message.id);if(row)await provider('Messages',JSON.parse(row.data).provider_id);db.close();
 // An acknowledgement may arrive before the final completed callback. Recheck after SMS delivery.
 for(const a of incident.attempts)await provider('Calls',a.provider_id);
 if(!report.provider.some(p=>p.resource==='Calls'&&p.status==='completed')&&!report.sos.voice.includes('ACKNOWLEDGED'))throw Error('Neither call completion nor acknowledgement was confirmed.');
 if(!report.sos.sms.includes('DELIVERED')||message.status!=='DELIVERED')throw Error('Provider-confirmed SMS delivery was not completed for both flows.');
 console.log('Both SMS flows delivered and the SOS call was confirmed through n8n Cloud.');
}catch(e){report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{
 if(incident)await call('POST',`/v1/sos/${incident.id}/cancel`,{},randomUUID()).catch(()=>{});
 if(trip){await call('POST',`/v1/trips/${trip.id}/end`,{},randomUUID()).catch(()=>{});await call('DELETE',`/v1/trips/${trip.id}`).catch(()=>{});}
 writeFileSync('artifacts/cloud-delivery-check.json',JSON.stringify(report,null,2)+'\n');
}
