function recordedTime(location){
 const value=location?.timestamp_ms;
 if(!Number.isFinite(value)||value<=0)return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date:null;
}
function spokenAge(location,now){
 const recorded=recordedTime(location);
 if(!recorded||recorded.getTime()>now+30000)return 'We do not know when that position was recorded.';
 const minutes=Math.floor(Math.max(0,now-recorded.getTime())/60000);
 if(minutes<1)return 'It was recorded less than a minute ago.';
 const [amount,unit]=minutes<60?[minutes,'minute']:minutes<1440?[Math.floor(minutes/60),'hour']:[Math.floor(minutes/1440),'day'];
 return `It was recorded ${amount} ${unit}${amount===1?'':'s'} ago.`;
}
export function voiceAlertMessage(incident,now=Date.now()){
 const loc=incident.location;
 const locationText=loc?(loc.address?`Their last recorded position was near ${loc.address}. ${spokenAge(loc,now)}`:`${spokenAge(loc,now)} An address could not be confirmed. Please open the map link in their alert text to see the recorded position.`):'';
 return [
  `Waymate alert. Your contact ${incident.trigger==='TIMEOUT'?(incident.check_in_kind==='DEVIATION'?'missed a safety check-in after moving away from their planned route':'missed a safety check-in'):'requested help'}.`,
  locationText,
  'Please call them now. Press 1 to acknowledge you have received this alert.'
 ].filter(Boolean).join(' ');
}
export function smsAlertMessage(incident){
 const loc=incident.location,recorded=recordedTime(loc);
 const locationText=loc?` Last recorded position${loc.address?' near '+loc.address:''} (${recorded?recorded.toISOString():'recording time unknown'}): https://maps.google.com/?q=${loc.latitude},${loc.longitude}`:' No location was shared with this alert.';
 const companion=incident.companion_url?` Private journey link: ${incident.companion_url}`:'';
 return 'Waymate SOS: Your contact '+(incident.trigger==='TIMEOUT'?(incident.check_in_kind==='DEVIATION'?'missed a safety check-in after moving away from their planned route.':'missed a safety check-in.'):'requested help.')+locationText+companion+' Please call your contact. SMS delivery does not confirm they are safe.';
}
