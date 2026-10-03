// Runs the real server's demo deadline. Never requests real SMS or calls.
import {writeFileSync} from 'node:fs';
const base=process.env.PUBLIC_BASE_URL;let token;
async function call(method,path,body){const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(`Battery demo check: HTTP ${response.status}`);return response.json();}
const session=await call('POST','/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE});token=session.session_token;
const demo=await call('POST','/v1/battery-demo',{contacts:[]}),started=Date.now();let latest=demo;
while(Date.now()-started<35000){await new Promise(r=>setTimeout(r,2000));latest=await call('GET','/v1/battery-demo/'+demo.id);if(latest.state==='ALERTED')break;}
const result={at:new Date().toISOString(),server:base,initial_state:demo.state,final_state:latest.state,elapsed_ms:Date.now()-started,simulated_sms:latest.sms_attempts?.length||0,only_simulated:latest.sms_attempts?.every(s=>s.status==='SIMULATED')||false,clearly_labeled_demo:latest.message?.startsWith('DEMO')||false};
await call('DELETE','/v1/battery-demo/'+demo.id);writeFileSync('artifacts/battery-demo-live-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.final_state!=='ALERTED'||!result.only_simulated||!result.clearly_labeled_demo)process.exitCode=1;
