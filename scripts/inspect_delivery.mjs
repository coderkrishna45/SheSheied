// Read-only provider and local delivery diagnostics. No message bodies or full phone numbers.
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;
const headers={Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64')};
for(const [resource,list] of [['Calls','calls'],['Messages','messages'],['OutgoingCallerIds','outgoing_caller_ids']]){
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${resource}.json?PageSize=8`,{headers,signal:AbortSignal.timeout(15000)});
 const body=await response.json();if(!response.ok){console.log(JSON.stringify({resource,http:response.status,code:body.code}));continue;}
 console.log(JSON.stringify({resource,records:body[list]?.map(r=>({status:r.status,error_code:r.error_code??null,recipient_last4:String(r.to||r.phone_number||'').slice(-4),created:r.date_created,duration:r.duration}))}));
}
const db=new DatabaseSync(resolve('api',process.env.DATABASE_PATH||'data/sheshield.sqlite'),{readOnly:true});
for(const kind of ['sos','attempt','sms_attempt']){
 const items=db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(r=>JSON.parse(r.data)).sort((a,b)=>b.created_at_ms-a.created_at_ms).slice(0,6);
 console.log(JSON.stringify({local:kind,records:items.map(r=>({mode:r.mode,status:r.status,recipient_last4:r.contact?.phone.slice(-4),has_provider_id:Boolean(r.provider_id),contacts:r.contacts?.length,created:r.created_at_ms}))}));
}db.close();
