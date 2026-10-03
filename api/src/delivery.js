// Configuration eligibility is separate from carrier delivery and acknowledgement.
export function deliveryAvailability(config,contact){
  let reason=null;
  if(config.LIVE_ALERTS_ENABLED!=='true')reason='Cloud alerts are disabled on the service.';
  else if(!config.N8N_WEBHOOK_URL||!config.WORKER_TOKEN)reason='The cloud delivery workflow is not configured.';
  else if(!config.PUBLIC_BASE_URL?.startsWith('https://')||!config.TWILIO_AUTH_TOKEN)reason='Public provider callbacks are not configured.';
  else if(config.trialVerificationKnown&&!(config.verifiedTrialRecipients||[]).includes(contact.phone))reason='Twilio has not confirmed this trial recipient. Verify the number in the same Twilio account, then check cloud calls & SMS in Circle.';
  else if(![...(config.TEST_RECIPIENT_ALLOWLIST||'').split(',').map(s=>s.trim()),...(config.verifiedTrialRecipients||[])].includes(contact.phone))reason='This recipient is not enabled for cloud alerts. Verify the number in Twilio trial settings, then check cloud calls & SMS in Circle.';
  const smsReason=reason||(config.LIVE_SMS_ENABLED!=='true'?'Cloud SMS is disabled on the service.':null);
  return {contact,voice_configured:!reason,sms_configured:!smsReason,voice_reason:reason,sms_reason:smsReason,delivery_confirmed:false};
}

// Only Twilio's verified recipients can extend a trial account's explicit allowlist.
// This never sends a message, makes a call, or enables arbitrary recipients.
export function trialRecipientRegistry(config,{fetcher=fetch,now=Date.now}={}){
  let checkedAt=null,pending=null,lastError=null;
  async function refresh(force=false){
    if(config.TRIAL_SYNC_VERIFIED_RECIPIENTS!=='true')return;
    if(pending)return pending;
    if(!force&&checkedAt!=null&&now()-checkedAt<60000)return;
    pending=(async()=>{
      try{
        if(!/^AC[a-f0-9]{32}$/i.test(config.TWILIO_ACCOUNT_SID||'')||!config.TWILIO_AUTH_TOKEN)throw Error('credentials');
        const base='https://api.twilio.com/2010-04-01/Accounts/'+config.TWILIO_ACCOUNT_SID;
        const headers={Authorization:'Basic '+Buffer.from(config.TWILIO_ACCOUNT_SID+':'+config.TWILIO_AUTH_TOKEN).toString('base64')};
        const signal=AbortSignal.timeout(5000);
        async function get(path){const r=await fetcher(base+path,{headers,signal});if(!r.ok)throw Error('provider');return r.json();}
        const account=await get('.json');
        let verified=[];
        if(account.type==='Trial'&&account.status==='active'){
          const ids=await get('/OutgoingCallerIds.json?PageSize=1000');
          verified=(ids.outgoing_caller_ids||[]).map(n=>n.phone_number).filter(p=>/^\+[1-9]\d{7,14}$/.test(p));
        }
        config.verifiedTrialRecipients=verified;
        config.trialVerificationKnown=account.type==='Trial'&&account.status==='active';
        lastError=null;
      }catch{lastError='Twilio verification could not be refreshed. Saved eligible recipients remain available; check Twilio settings if delivery fails.';}
      finally{checkedAt=now();pending=null;}
    })();return pending;
  }
  return {refresh,notice:()=>lastError||'Configuration checked. Verified Twilio trial recipients are refreshed automatically. Carrier delivery and account limits still apply.'};
}
