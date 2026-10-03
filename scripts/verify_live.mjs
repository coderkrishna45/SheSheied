import {routeLive,searchPlaces} from '../api/src/providers.js';
for(const query of ['Victoria Memorial Kolkata','Indian Museum Kolkata']){
 const places=await searchPlaces(query,process.env.ORS_API_KEY);
 if(!places.length||places.some(p=>p.latitude<22.35||p.latitude>22.80||p.longitude<88.15||p.longitude>88.60))throw Error('Kolkata place search returned missing or distant results');
 console.log('Live Kolkata place search:',query,places.length,'local results');
 await new Promise(resolve=>setTimeout(resolve,1200));
}
const routes=await routeLive([88.3510,22.5641],[88.3426,22.5448],process.env.ORS_API_KEY);
for(const r of routes)console.log(JSON.stringify({id:r.route_id,geometryPoints:r.geometry.length,distanceMeters:r.distance_meters,durationSeconds:r.duration_seconds,instructions:r.steps.length,start:r.geometry[0],end:r.geometry.at(-1)}));
if(routes.every(r=>r.geometry.length<=2))throw Error('No usable road geometry');
console.log('Live walking geometry verified. No alerts were requested.');
