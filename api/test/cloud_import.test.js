import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareCloudWorkflow} from '../../scripts/prepare_n8n_cloud.mjs';

const template=JSON.parse(readFileSync(new URL('../../n8n/workflows/04_cloud_delivery_v2.json',import.meta.url)));
test('cloud import reuses the Twilio sender and credential without copying legacy recipients, callbacks or tokens',()=>{
 const legacy={nodes:[
  {type:'n8n-nodes-base.twilio',parameters:{resource:'call',from:'+1 (202) 555-0100',to:'+919999999999',options:{statusCallback:'https://old.example/callback'}},credentials:{twilioApi:{id:'existing-credential',name:'Existing Twilio'}}},
  {type:'n8n-nodes-base.httpRequest',parameters:{url:'https://example.invalid/private-bot-token'}}
 ]};
 const original=JSON.stringify(template),sid='AC'+'a'.repeat(32),workflow=prepareCloudWorkflow(template,legacy,sid);
 const nodes=Object.fromEntries(workflow.nodes.map(n=>[n.name,n]));
 for(const name of ['Place Call','Send SMS']){
  assert.equal(nodes[name].parameters.authentication,'predefinedCredentialType');
  assert.equal(nodes[name].parameters.nodeCredentialType,'twilioApi');
  assert.equal(nodes[name].credentials.twilioApi.id,'existing-credential');
  assert.equal(nodes[name].parameters.genericAuthType,undefined);
 }
 const fields=Object.fromEntries(nodes.Configuration.parameters.assignments.assignments.map(f=>[f.name,f.value]));
 assert.equal(fields.from_number,'+12025550100');assert.equal(fields.account_sid,sid);
 assert.equal(workflow.active,false);assert.equal(JSON.stringify(template),original);
 const exported=JSON.stringify(workflow);
 for(const forbidden of ['private-bot-token','https://old.example/callback','+919999999999'])assert.ok(!exported.includes(forbidden));
 assert.equal(nodes['Delivery Job'].parameters.authentication,'headerAuth');
 assert.equal(nodes['Claim Attempt'].parameters.genericAuthType,'httpHeaderAuth');
 assert.equal(nodes['Claim SMS'].parameters.genericAuthType,'httpHeaderAuth');
 assert.equal(workflow.connections['Is SMS Job'].main[0][0].node,'Claim SMS');
 assert.equal(workflow.connections['Is SMS Job'].main[1][0].node,'Claim Attempt');
});
test('cloud import refuses malformed sender or Account SID instead of generating a broken configuration',()=>{
 const legacy={nodes:[{type:'n8n-nodes-base.twilio',parameters:{resource:'call',from:'+12025550100'},credentials:{twilioApi:{id:'id',name:'Twilio'}}}]};
 assert.throws(()=>prepareCloudWorkflow(template,legacy,'invalid'),/Account SID/);
 legacy.nodes[0].parameters.from='invalid';assert.throws(()=>prepareCloudWorkflow(template,legacy),/sender/);
 assert.throws(()=>prepareCloudWorkflow(template,{nodes:[]}),/credential/);
});
test('current account senders override the historical sender and preserve the receiver from each claimed job',()=>{
 const legacy={nodes:[{type:'n8n-nodes-base.twilio',parameters:{resource:'call',from:'+12025550100',to:'+919999999999'},credentials:{twilioApi:{id:'id',name:'Twilio'}}}]};
 const senders={fromNumber:'+1 (202) 555-0199',smsFromNumber:'+12025550188'};
 const workflow=prepareCloudWorkflow(template,legacy,'AC'+'a'.repeat(32),senders);
 const nodes=Object.fromEntries(workflow.nodes.map(n=>[n.name,n]));
 const fields=Object.fromEntries(nodes.Configuration.parameters.assignments.assignments.map(f=>[f.name,f.value]));
 assert.equal(fields.from_number,'+12025550199');assert.equal(fields.sms_from_number,'+12025550188');
 assert.ok(!JSON.stringify(workflow).includes('+919999999999'));
 const claim={attempt_id:'test-attempt',to:'+919888888888',message:'Help',callback_url:'https://api.example/callback',ack_url:'https://api.example/ack'};
 for(const [name,sender] of [['Build Voice Message',fields.from_number],['Build SMS',fields.sms_from_number]]){
  const run=new Function('$input','$',nodes[name].parameters.jsCode);
  const result=run({first:()=>({json:claim})},()=>({first:()=>({json:fields})}));
  const body=new URLSearchParams(result[0].json.form_body);
  assert.equal(body.get('From'),sender);assert.equal(body.get('To'),claim.to);
 }
 assert.throws(()=>prepareCloudWorkflow(template,legacy,'',{smsFromNumber:'invalid'}),/SMS sender/);
});
