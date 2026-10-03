import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

// Only copy the sender and credential reference from the historical workflow.
// Its Telegram tokens, hardcoded recipients and old callbacks stay out of the import.
export function prepareCloudWorkflow(template,legacy,accountSid='',senders={}) {
 const workflow=structuredClone(template);
 const call=legacy.nodes?.find(n=>n.type==='n8n-nodes-base.twilio'&&n.parameters?.resource==='call'&&n.credentials?.twilioApi);
 if(!call)throw new Error('The source workflow has no Twilio call credential to reuse.');
 const sender=String(senders.fromNumber||call.parameters.from||'').replace(/[\s()-]/g,'');
 const smsSender=String(senders.smsFromNumber||'').replace(/[\s()-]/g,'');
 if(!/^\+[1-9]\d{7,14}$/.test(sender))throw new Error('Configure a valid Twilio voice sender number.');
 if(smsSender&&!/^\+[1-9]\d{7,14}$/.test(smsSender))throw new Error('Configure a valid Twilio SMS sender number.');
 if(accountSid&&!/^AC[a-f0-9]{32}$/i.test(accountSid))throw new Error('TWILIO_ACCOUNT_SID must be the Account SID beginning with AC.');
 workflow.name='SheShield Cloud calls and SMS';
 workflow.active=false;
 const fields=workflow.nodes.find(n=>n.name==='Configuration').parameters.assignments.assignments;
 fields.find(f=>f.name==='from_number').value=sender;
 fields.find(f=>f.name==='sms_from_number').value=smsSender;
 if(accountSid)fields.find(f=>f.name==='account_sid').value=accountSid;
 for(const name of ['Place Call','Send SMS']){
  const node=workflow.nodes.find(n=>n.name===name);
  node.parameters.authentication='predefinedCredentialType';
  node.parameters.nodeCredentialType='twilioApi';
  delete node.parameters.genericAuthType;
  node.credentials={twilioApi:{id:call.credentials.twilioApi.id,name:call.credentials.twilioApi.name}};
 }
 return workflow;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const source=process.argv[2]||'SheShield.json',destination=process.argv[3]||'.tools/n8n/SheShield-cloud-import.json';
  const template=JSON.parse(readFileSync(new URL('../n8n/workflows/04_cloud_delivery_v2.json',import.meta.url)));
  const workflow=prepareCloudWorkflow(template,JSON.parse(readFileSync(source)),process.env.TWILIO_ACCOUNT_SID||'',{
   fromNumber:process.env.TWILIO_FROM_NUMBER,smsFromNumber:process.env.TWILIO_SMS_FROM_NUMBER
  });
  mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(workflow,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({file:destination,sender_source:process.env.TWILIO_FROM_NUMBER?'api/.env':'source workflow',twilio_credential_reference_reused:true,account_sid_configured:Boolean(process.env.TWILIO_ACCOUNT_SID),published:false}));
  console.log('Import into n8n Cloud, confirm the Twilio credential, bind SheShield worker Header Auth, set Account SID if still blank, and publish. No workflow was executed.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
