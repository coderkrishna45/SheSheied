// Search only. No journeys, location uploads, alerts, calls or SMS.
import {writeFileSync} from 'node:fs';
const base=process.env.PUBLIC_BASE_URL;const results=[];
const session=await fetch(base+'/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollment_code:process.env.ENROLLMENT_CODE}),signal:AbortSignal.timeout(15000)});
if(!session.ok)throw Error('API enrollment failed.');const token=(await session.json()).session_token;
for(const q of ['Victoria Memorial Kolkata','Indian Museum Kolkata']){
 const started=Date.now();const r=await fetch(base+'/v1/places?q='+encodeURIComponent(q),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(24000)});const body=await r.json();
 const entry={query:q,http:r.status,milliseconds:Date.now()-started,places:body.places?.length||0,code:body.code||null};results.push(entry);console.log(JSON.stringify(entry));if(!r.ok||!body.places?.length)process.exitCode=1;
 await new Promise(r=>setTimeout(r,1200));
}
writeFileSync('artifacts/search-live-check.json',JSON.stringify({at:new Date().toISOString(),results},null,2)+'\n');
