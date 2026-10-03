// Explicitly invoked live test: one clearly marked demo SMS to the owner's
// already-allowlisted, verified number ending 1265. No calls or journeys.
import {writeFileSync} from 'node:fs';
if(!process.argv.includes('--send-to-owner'))throw Error('This sends one real demo SMS. Pass --send-to-owner only for an authorized delivery test.');
const candidates=(process.env.TEST_RECIPIENT_ALLOWLIST||'').split(',').map(p=>p.trim()).filter(p=>p.endsWith('1265'));
if(candidates.length!==1)throw Error('The owner test recipient must be uniquely present in the saved allowlist.');
const base=process.env.PUBLIC_BASE_URL;let token;
async function call(method,path,body){const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Demo check ${path.split('/')[2]}: HTTP ${r.status}`);return r.json();}
token=(await call('POST','/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE})).session_token;
const demo=await call('POST','/v1/battery-demo',{contacts:[{name:'Owner demo recipient',phone:candidates[0]}],deliver_sms:true}),start=Date.now();let state=demo,lastStatus;
while(Date.now()-start<90000){
 await new Promise(r=>setTimeout(r,2000));state=await call('GET','/v1/battery-demo/'+demo.id);const status=state.sms_attempts?.[0]?.status||state.state;
 if(status!==lastStatus){console.log(JSON.stringify({demo_status:status,elapsed_ms:Date.now()-start}));lastStatus=status;}
 if(['DELIVERED','FAILED','UNDELIVERED','UNAVAILABLE','CANCELLED','REQUEST_UNKNOWN'].includes(status))break;
}
const sms=state.sms_attempts?.[0];let provider;
if(sms?.provider_id){const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages/${sms.provider_id}.json`,{headers:{Authorization:'Basic '+Buffer.from(process.env.TWILIO_ACCOUNT_SID+':'+process.env.TWILIO_AUTH_TOKEN).toString('base64')},signal:AbortSignal.timeout(15000)});const data=await r.json();provider={http:r.status,status:data.status,error_code:data.error_code,segments:data.num_segments};}
const result={at:new Date().toISOString(),recipient_last4:'1265',status:sms?.status||state.state,provider,clearly_labeled_demo:state.message?.startsWith('DEMO')||false};
writeFileSync('artifacts/battery-sms-live-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
if(result.status!=='DELIVERED')process.exitCode=1;
