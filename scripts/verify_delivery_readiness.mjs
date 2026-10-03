// Account/recipient inspection and app preflight only. No calls, texts or alerts.
import {writeFileSync} from 'node:fs';
const sid=process.env.TWILIO_ACCOUNT_SID,auth=process.env.TWILIO_AUTH_TOKEN;
const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json?PageSize=1000`,{headers:{Authorization:'Basic '+Buffer.from(sid+':'+auth).toString('base64')},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Twilio recipient inspection failed.');
const verified=(await response.json()).outgoing_caller_ids||[];
const base=process.env.PUBLIC_BASE_URL;
const enrolled=await fetch(base+'/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollment_code:process.env.ENROLLMENT_CODE}),signal:AbortSignal.timeout(15000)});
if(!enrolled.ok)throw Error('App enrollment failed.');const token=(await enrolled.json()).session_token;
const check=await fetch(base+'/v1/delivery/check',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({contacts:verified.slice(0,10).map((v,i)=>({name:'Verified recipient '+(i+1),phone:v.phone_number}))}),signal:AbortSignal.timeout(15000)});
if(!check.ok)throw Error('App preflight failed.');const result=await check.json();
const safe={at:new Date().toISOString(),recipients:result.contacts.map(c=>({last4:c.contact.phone.slice(-4),voice_configured:c.voice_configured,sms_configured:c.sms_configured,voice_reason:c.voice_reason,sms_reason:c.sms_reason})),notice:result.notice,delivery_tested:false};
writeFileSync('artifacts/circle-readiness.json',JSON.stringify(safe,null,2)+'\n');console.log(JSON.stringify(safe));
if(!safe.recipients.length||safe.recipients.some(c=>!c.voice_configured||!c.sms_configured))process.exitCode=1;
