import {ApiError} from './providers.js';
import {validPoint} from './risk.js';

export const BATTERY_POLICY={low_percent:10,recovered_percent:15,silence_ms:300000};
export function batteryHeartbeat(previous,body,now){
 if(!body||!Number.isInteger(body.percent)||body.percent<0||body.percent>100||typeof body.charging!=='boolean'||typeof body.enabled!=='boolean'||!Number.isFinite(body.observed_at_ms)||body.observed_at_ms>now+30000||body.observed_at_ms<now-120000)throw new ApiError('INVALID_BATTERY','Send a current battery reading between 0 and 100 percent.');
 if(previous&&body.observed_at_ms<=previous.observed_at_ms)return previous;
 let location=previous?.location||null;
 if(body.location){const l=body.location,accuracy=l.accuracy??l.accuracy_meters;if(!validPoint([l.longitude,l.latitude])||!Number.isFinite(l.timestamp_ms)||l.timestamp_ms>now+30000||l.timestamp_ms<now-600000||!Number.isFinite(accuracy)||accuracy<0||accuracy>1000)throw new ApiError('INVALID_LOCATION','Battery protection needs a valid last recorded position.');
  if(!location||l.timestamp_ms>=location.timestamp_ms)location={latitude:l.latitude,longitude:l.longitude,accuracy,timestamp_ms:l.timestamp_ms};
 }
 const watch={...previous,percent:body.percent,charging:body.charging,enabled:body.enabled,observed_at_ms:body.observed_at_ms,last_seen_at_ms:now,location};
 if(!body.enabled){watch.state='OFF';watch.deadline_ms=null;}
 else if(body.charging||body.percent>BATTERY_POLICY.recovered_percent){watch.state='MONITORING';watch.deadline_ms=null;}
 else if(previous?.state==='ALERTED'||previous?.state==='RECOVERED'){watch.state='RECOVERED';watch.deadline_ms=null;}
 else if(body.percent<=BATTERY_POLICY.low_percent||previous?.state==='ARMED'){watch.state='ARMED';watch.deadline_ms=now+BATTERY_POLICY.silence_ms;watch.armed_at_ms=previous?.state==='ARMED'?previous.armed_at_ms:now;}
 else{watch.state='MONITORING';watch.deadline_ms=null;}
 return watch;
}
export function batterySmsMessage(watch,now,demo=false){
 const loc=watch.location,age=loc?Math.max(0,Math.floor((now-loc.timestamp_ms)/60000)):null;
 const map=loc?`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`:'';
 // A single smart apostrophe/em dash can turn an entire SMS into UCS-2 and
 // exceed Twilio's trial segment limit. Keep optional address prose short and
 // ASCII; the exact map link still works for addresses in any writing system.
 const label=loc?.address?.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,'-').split(',').slice(0,2).join(',').trim();
 const address=label&&/^[\x20-\x7e]+$/.test(label)&&label.length<=64?' near '+label:'';
 if(demo)return `DEMO: simulated battery and location; ${watch.percent}% phone offline. No emergency.${map?' '+map:' No GPS.'}`;
 const whereabouts=loc?` Last GPS ${age<1?'<1':age} min ago${address}${Number.isFinite(loc.accuracy)?' (about '+Math.round(loc.accuracy)+' m)':''}: ${map}. Not a live location.`:' No location was available.';
 return `Waymate: last battery ${watch.percent}%; no updates for 5 minutes. Battery may have run out or connection failed.${whereabouts} Please call your contact.`;
}
