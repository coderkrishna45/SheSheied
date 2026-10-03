import {randomUUID} from 'node:crypto';
const base=process.env.VERIFY_API_URL||'http://127.0.0.1:8787';let token;
async function call(method,path,payload,key){const r=await fetch(base+path,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Error(`${method} ${path}: HTTP ${r.status} (${result.code})`);return result;}
const session=await call('POST','/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE});token=session.session_token;
const plan=await call('POST','/v1/plans',{mode:'LIVE',origin:{label:'Esplanade, Kolkata',latitude:22.5641,longitude:88.3510},destination:{label:'Victoria Memorial, Kolkata',latitude:22.5448,longitude:88.3426}});
if(!plan.routes.length||plan.routes.some(r=>r.geometry.length<=2))throw Error('Invalid walking geometry');
const route=plan.routes[0],body={plan_id:plan.id,route_id:route.route_id,contacts:[]},key=randomUUID();let trip;
try{
 trip=await call('POST','/v1/trips',body,key);const repeat=await call('POST','/v1/trips',body,key);if(trip.id!==repeat.id)throw Error('Duplicate start created two trips');
 const p=route.geometry[0];await call('POST',`/v1/trips/${trip.id}/locations`,{latitude:p[1],longitude:p[0],accuracy_meters:5,timestamp_ms:Date.now(),sequence:1});
 const ended=await call('POST',`/v1/trips/${trip.id}/end`,{},randomUUID());if(ended.state!=='COMPLETED')throw Error('Journey did not end');
 console.log(JSON.stringify({routes:plan.routes.length,selectedGeometryPoints:route.geometry.length,exposure:route.risk_level,coverage:route.coverage,destination:trip.destination.label,idempotentStart:true,ended:true}));
 console.log('Live API journey verified with no contacts and no alerts.');
}finally{if(trip){await call('POST',`/v1/trips/${trip.id}/end`,{},randomUUID());await call('DELETE',`/v1/trips/${trip.id}`);}}
