// GET requests only. No calls, texts, workflow executions or credentials in output.
import {readFileSync} from 'node:fs';

const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;
const recipients=(process.env.TEST_RECIPIENT_ALLOWLIST||'').split(',').map(s=>s.trim()).filter(Boolean);
try{
 if(!/^AC[a-f0-9]{32}$/i.test(sid||'')||!token)throw new Error('Save the Account SID and Auth Token from the same Twilio account in api/.env.');
 if(!recipients.length||recipients.some(p=>!/^\+[1-9]\d{7,14}$/.test(p)))throw new Error('Save a valid international test recipient in TEST_RECIPIENT_ALLOWLIST.');
 const headers={Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64')};
 async function get(path){
  const response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+sid+path,{headers,signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok)throw new Error(`Twilio rejected the read-only request: HTTP ${response.status}, code ${body.code||'unknown'}. For 20003, check the Account SID/Auth Token pair in Twilio Console.`);
  return body;
 }
 const account=await get('.json');
 console.log(JSON.stringify({check:'Twilio authentication',account_status:account.status,account_type:account.type}));
 const workflow=JSON.parse(readFileSync('.tools/n8n/SheShield-cloud-import.json'));
 const sender=workflow.nodes.find(n=>n.name==='Configuration').parameters.assignments.assignments.find(a=>a.name==='from_number').value;
 const numbers=await get('/IncomingPhoneNumbers.json?PageSize=1000');
 const selected=numbers.incoming_phone_numbers?.find(n=>n.phone_number===sender);
 console.log(JSON.stringify({check:'workflow sender',registered_number_count:numbers.incoming_phone_numbers?.length||0,registered_on_account:Boolean(selected),voice_capable:selected?.capabilities?.voice??null,sms_capable:selected?.capabilities?.sms??null}));
 const verified=await get('/OutgoingCallerIds.json?PageSize=1000');
 console.log(JSON.stringify({check:'allowlist matched to verified caller IDs',recipient_count:recipients.length,verified_count:recipients.filter(p=>verified.outgoing_caller_ids?.some(n=>n.phone_number===p)).length}));
 console.log('Read-only checks complete. Actual delivery and trial content restrictions still require separate verification.');
}catch(error){
 console.error(error.message==='fetch failed'?'Could not reach Twilio for the read-only check.':error.message);
 process.exitCode=1;
}
