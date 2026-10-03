// Real provider directions in an isolated API. No production journeys, worker, contacts or delivery.
import {buildApp} from '../api/src/app.js';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=buildApp({disableWorker:true,config:{DATABASE_PATH:':memory:',LIVE_ALERTS_ENABLED:'false',LIVE_SMS_ENABLED:'false',N8N_WEBHOOK_URL:'',PUBLIC_BASE_URL:''}});
let token,i=0;
async function call(method,url,payload){const r=await app.inject({method,url,payload,headers:{...(token?{authorization:'Bearer '+token}:{}),'idempotency-key':'verify-'+i++}});if(r.statusCode!==200)throw Error(`${r.statusCode}: ${r.json().code}`);return r.json();}
try{
 token=(await call('POST','/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE})).session_token;
 const plan=await call('POST','/v1/plans',{mode:'LIVE',origin:{label:'Technopolis',latitude:22.580933,longitude:88.437032},destination:{label:'Wipro',latitude:22.578998,longitude:88.426699}});
 const trip=await call('POST','/v1/trips',{plan_id:plan.id,route_id:plan.routes[0].route_id,contacts:[],departure_protection:{enabled:true,window_seconds:120}});
 const fix={latitude:22.580933,longitude:88.437032,accuracy_meters:5,timestamp_ms:Date.now(),sequence:Date.now()};
 await call('POST',`/v1/trips/${trip.id}/locations`,fix);
 const places=await call('POST',`/v1/trips/${trip.id}/nearby`,{origin:fix});assert.ok(places.places.length);
 const chosen=places.places.find(p=>p.name==='Composite Hospital')||places.places[0];
 const proposal=await call('POST',`/v1/trips/${trip.id}/reroute`,{origin:fix,via_place_id:chosen.id});assert.equal(proposal.routes[0].via_place.id,chosen.id);
 const accepted=await call('POST',`/v1/trips/${trip.id}/route`,{proposal_id:proposal.proposal_id,route_id:proposal.routes[0].route_id,route_revision:proposal.routes[0].route_revision,expected_check_in_id:''});
 assert.deepEqual(accepted.destination,trip.destination);assert.equal(accepted.departure_protection.enabled,true);assert.equal(accepted.route.risk_level,'UNKNOWN');
 await call('POST',`/v1/trips/${trip.id}/end`,{});assert.equal(app.store.list('sos').length,0);assert.equal(app.store.list('attempt').length,0);assert.equal(app.store.list('sms_attempt').length,0);
 const report={checked_at:new Date().toISOString(),isolation:'In-memory API, worker disabled, no contacts, no n8n requests',facility:{id:chosen.id,name:chosen.name,hours:chosen.hours_status,entrance:chosen.entrance_status},original_walk_meters:trip.route.distance_meters,via_walk_meters:accepted.route.distance_meters,destination_preserved:true,protection_preserved:true,safety:'UNKNOWN',alerts_requested:0};
 writeFileSync('artifacts/nearby-walking-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){console.error('Walking option check failed: '+e.message);process.exitCode=1;}finally{await app.close();}
