// Read-only inspection. Prints node bindings and webhook paths, never credentials.
const key=process.env.N8N_API_KEY;
if(!key){console.error('Save N8N_API_KEY in ignored api/.env to inspect the existing cloud workflow.');process.exit(1);}
const base='https://alluvia.app.n8n.cloud/api/v1';
try{
 let cursor;
 do{
  const response=await fetch(`${base}/workflows?limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{headers:{'X-N8N-API-KEY':key},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`n8n Cloud returned HTTP ${response.status}. Check API-key access and expiry.`);
  const page=await response.json();
  for(const workflow of page.data||[]){
   if(!/shield|sos|delivery/i.test(workflow.name||'')&&!workflow.nodes?.some(n=>/sheshield/i.test(n.parameters?.path||'')))continue;
   console.log(JSON.stringify({id:workflow.id,name:workflow.name,active:workflow.active,nodes:workflow.nodes?.map(node=>({name:node.name,type:node.type,webhook_path:node.type==='n8n-nodes-base.webhook'?node.parameters?.path:undefined,authentication:node.parameters?.authentication,credential_types:Object.keys(node.credentials||{})})),sms_branch:workflow.nodes?.some(n=>n.name==='Claim SMS')}));
  }
  cursor=page.nextCursor;
 }while(cursor);
 console.log('Read-only n8n Cloud inspection complete. No workflows executed or modified.');
}catch(error){console.error(error.message);process.exitCode=1;}
