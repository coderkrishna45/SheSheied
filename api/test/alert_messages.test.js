import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceAlertMessage,smsAlertMessage} from '../src/alert_messages.js';

const now=Date.parse('2026-10-02T12:00:00Z');
test('a call without GPS asks for help and acknowledgement without announcing a location error',()=>{
 const incident={trigger:'MANUAL',location:null};
 assert.equal(voiceAlertMessage(incident,now),'Waymate alert. Your contact requested help. Please call them now. Press 1 to acknowledge you have received this alert.');
 assert.ok(smsAlertMessage(incident).includes('No location was shared with this alert.'));
 assert.ok(!smsAlertMessage(incident).includes('maps.google.com'));
});
test('recorded GPS uses clear spoken age, keeps coordinates out of speech and preserves the SMS map link',()=>{
 const incident={trigger:'TIMEOUT',location:{latitude:22.55783,longitude:88.35124,timestamp_ms:now-120000}};
 const speech=voiceAlertMessage(incident,now),sms=smsAlertMessage(incident);
 assert.ok(speech.includes('missed a safety check-in'));
 assert.ok(!speech.includes('latitude')&&!speech.includes('longitude'));
 assert.ok(speech.includes('open the map link'));
 assert.ok(speech.includes('recorded 2 minutes ago'));
 assert.ok(!speech.includes('2026-'));
 assert.ok(sms.includes('2026-10-02T11:58:00.000Z'));
 assert.ok(sms.includes('https://maps.google.com/?q=22.55783,88.35124'));
 assert.ok(voiceAlertMessage({...incident,location:{...incident.location,timestamp_ms:now-3600000}},now).includes('1 hour ago'));
});
test('spoken alerts use a readable nearby address with age instead of reciting GPS numbers',()=>{
 const incident={trigger:'MANUAL',location:{latitude:22.55783,longitude:88.35124,timestamp_ms:now-120000,address:'Indian Museum, Jawaharlal Nehru Road, Kolkata'}};
 const speech=voiceAlertMessage(incident,now);
 assert.ok(speech.includes('near Indian Museum, Jawaharlal Nehru Road, Kolkata'));assert.ok(speech.includes('2 minutes ago'));assert.ok(!speech.includes('22.55783'));assert.ok(smsAlertMessage(incident).includes(incident.location.address));
});
test('missing or invalid location timestamps cannot break delivery or pretend a position is fresh',()=>{
 for(const timestamp_ms of [undefined,0,1e300,'invalid']){
  const incident={location:{latitude:0,longitude:0,timestamp_ms}};
  assert.ok(voiceAlertMessage(incident,now).includes('We do not know when that position was recorded.'));
  assert.ok(smsAlertMessage(incident).includes('recording time unknown'));
  assert.ok(smsAlertMessage(incident).includes('https://maps.google.com/?q=0,0'));
 }
 assert.ok(voiceAlertMessage({location:{latitude:0,longitude:0,timestamp_ms:now+60000}},now).includes('We do not know when that position was recorded.'));
});
