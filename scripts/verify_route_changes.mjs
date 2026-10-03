import {createHash} from 'node:crypto';
import {haversine} from '../api/src/risk.js';
const base=process.env.VERIFY_API_URL||'http://127.0.0.1:8787';let token;
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(`HTTP ${r.status}: ${data.code}`);return data;}
token=(await post('/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE})).session_token;
const esplanade={label:'Esplanade',latitude:22.5641,longitude:88.3510},victoria={label:'Victoria Memorial',latitude:22.5448,longitude:88.3426},museum={label:'Indian Museum',latitude:22.5578,longitude:88.3512},park={label:'Park Street',latitude:22.5521,longitude:88.3526};
const signatures=new Set();
for(const [origin,destination] of [[esplanade,victoria],[esplanade,museum],[park,victoria],[park,museum]]){
 const plan=await post('/v1/plans',{mode:'REHEARSAL',origin,destination});const route=plan.routes[0],points=route.geometry;
 const startError=haversine(origin.latitude,origin.longitude,points[0][1],points[0][0])*1000,endError=haversine(destination.latitude,destination.longitude,points.at(-1)[1],points.at(-1)[0])*1000;
 if(points.length<=2||startError>200||endError>200)throw Error('Route endpoints or geometry are invalid');
 if(plan.origin.latitude!==origin.latitude||plan.destination.longitude!==destination.longitude||route.is_demo_data)throw Error('Selected endpoints were substituted');
 const signature=createHash('sha256').update(JSON.stringify(points)).digest('hex');if(signatures.has(signature))throw Error('Changing endpoints reused old geometry');signatures.add(signature);
 console.log(JSON.stringify({from:origin.label,to:destination.label,alternatives:plan.routes.length,points:points.length,meters:route.distance_meters,startSnapMeters:Math.round(startError),endSnapMeters:Math.round(endError)}));
}
console.log('Four endpoint combinations produced four distinct real walking paths. No alerts or trips were started.');
