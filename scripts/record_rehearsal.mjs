import {readFileSync,writeFileSync} from 'node:fs';
import {routeLive} from '../api/src/providers.js';
import {segmentDistanceKm,scoreRoute} from '../api/src/risk.js';
const file=new URL('../demo/kolkata_scenario.json',import.meta.url),scenario=JSON.parse(readFileSync(file));
const routes=await routeLive([scenario.origin.longitude,scenario.origin.latitude],[scenario.destination.longitude,scenario.destination.latitude],process.env.ORS_API_KEY);
const fastest=routes.reduce((a,b)=>a.duration_seconds<b.duration_seconds?a:b);
let candidate=fastest.geometry[0],separation=-1;
for(const p of fastest.geometry.slice(8,-8)){
 const distance=Math.min(...routes.filter(r=>r!==fastest).map(r=>Math.min(...r.geometry.slice(1).map((b,i)=>segmentDistanceKm(p,r.geometry[i],b)))));
 if(distance>separation){separation=distance;candidate=p;}
}
scenario.routes=routes;scenario.geometry_source='Recorded OpenRouteService foot-walking GeoJSON; replay uses simulated positions';scenario.attribution='OpenRouteService / OpenStreetMap contributors';
scenario.incidents=Array.from({length:12},(_,i)=>({id:`FICTIONAL-${String(i+1).padStart(2,'0')}`,lat:candidate[1]+(i-6)*.00003,lng:candidate[0],category:'robbery',days_old:0,source:'Fictional rehearsal fixture'}));
scenario.incidents.push(...Array.from({length:8},(_,i)=>({id:`FICTIONAL-COMMON-${i}`,lat:scenario.destination.latitude+(i-4)*.00002,lng:scenario.destination.longitude,category:'robbery',days_old:0,source:'Fictional rehearsal fixture'})));
writeFileSync(file,JSON.stringify(scenario,null,2)+'\n');
for(const r of routes)console.log(r.route_id,r.geometry.length,r.distance_meters,scoreRoute(scenario.incidents,r.geometry,.5,{now:Date.parse(scenario.evaluated_at),coverage:'AVAILABLE'}).score);
