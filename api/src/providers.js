import {validPoint,haversine} from './risk.js';
export class ApiError extends Error {constructor(code,message,status=400,retryable=false){super(message);Object.assign(this,{code,status,retryable});}}
export async function fetchJson(url,options={},timeout=15000,policy={}) {
  const attempts=policy.singleAttempt?1:2;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const r=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
      if(!r.ok){
        // Routing calculations have no delivery side effects. Retry one transient gateway failure,
        // but do not retry bad credentials, invalid requests or provider rate limits.
        if(attempt+1<attempts&&policy.retryTransientStatuses&&[502,503,504].includes(r.status)){
          await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,250));continue;
        }
        throw new ApiError(r.status===429?'RATE_LIMITED':'PROVIDER_ERROR',`Provider returned HTTP ${r.status}.`,503,true);
      }
      return await r.json(); // The timeout also covers reading the response body.
    }catch(e){
      if(e instanceof ApiError)throw e;
      if(e instanceof SyntaxError)throw new ApiError('INVALID_PROVIDER_RESPONSE','The provider returned an invalid response.',502,true);
      if(attempt+1<attempts&&(e.name!=='TimeoutError'||policy.retryTimeouts)){
        await new Promise(resolve=>setTimeout(resolve,250));continue;
      }
      throw new ApiError('PROVIDER_UNAVAILABLE',policy.retryTimeouts?'The walking route service did not respond after retrying. Try again shortly.':'The external service did not respond. Try again.',503,true);
    }
  }
}
let nextFallbackStart=0;
async function fallbackSlot(){
  const at=Date.now(),wait=Math.max(0,nextFallbackStart-at);
  if(wait>1500)throw new ApiError('RATE_LIMITED','Place search is busy. Wait a moment and search again.',429,true);
  nextFallbackStart=Math.max(at,nextFallbackStart)+1100;
  if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
}
export function parseOrs(body,origin,destination) {
  if(!Array.isArray(body.features))throw new ApiError('INVALID_GEOMETRY','Routing returned no GeoJSON routes.',502);
  const seen=new Set();
  return body.features.flatMap((f,index)=>{
    const geometry=f.geometry?.coordinates,summary=f.properties?.summary;
    if(f.geometry?.type!=='LineString'||!Array.isArray(geometry)||geometry.length<2||!geometry.every(validPoint)||!Number.isFinite(summary?.distance)||!Number.isFinite(summary?.duration)||!(summary.distance>0)||!(summary.duration>0))throw new ApiError('INVALID_GEOMETRY','Routing returned invalid geometry or metrics.',502);
    const originSnap=haversine(origin[1],origin[0],geometry[0][1],geometry[0][0])*1000,destinationSnap=haversine(destination[1],destination[0],geometry.at(-1)[1],geometry.at(-1)[0])*1000;
    if(originSnap>200||destinationSnap>200)throw new ApiError('ENDPOINT_TOO_FAR','A selected endpoint is too far from an accessible walking path. Choose a nearby entrance or street.',422);
    const key=geometry.map(p=>p.map(x=>x.toFixed(5)).join(',')).join(';');if(seen.has(key))return [];seen.add(key);
    return [{route_id:`route-${index}`,geometry,duration_seconds:Math.round(summary.duration),distance_meters:Math.round(summary.distance),origin_snap_meters:Math.round(originSnap),destination_snap_meters:Math.round(destinationSnap),steps:(f.properties.segments||[]).flatMap(s=>s.steps||[])}];
  });
}
export async function routeLive(origin,destination,key,options={},request=fetchJson) {
  if(!key)throw new ApiError('ROUTING_NOT_CONFIGURED','Routing is not configured. Add ORS_API_KEY to the API environment.',503);
  const body={coordinates:options.via?[origin,options.via,destination]:[origin,destination],instructions:true};
  if(!options.via)body.alternative_routes={target_count:3,share_factor:.8,weight_factor:1.6};
  if(options.avoid_polygons)body.options={avoid_polygons:options.avoid_polygons};
  const calculate=(payload,timeout)=>request('https://api.openrouteservice.org/v2/directions/foot-walking/geojson',{method:'POST',headers:{Authorization:key,'Content-Type':'application/json'},body:JSON.stringify(payload)},timeout,{singleAttempt:true});
  const transient=e=>e.code==='PROVIDER_UNAVAILABLE'||/^Provider returned HTTP (502|503|504)\./.test(e.message);
  let response,reduced=false;
  try{response=await calculate(body,10000);}
  catch(e){
    // Alternative-route calculation is substantially more expensive. Recover with a
    // single real walking route, keeping the exact endpoints, via point and avoidances.
    // Quota, credential and invalid-input errors cannot be fixed by another request.
    if(!transient(e))throw e;
    const lighter={...body,...(!options.via?{alternative_routes:{target_count:2,share_factor:.9,weight_factor:1.6}}:{})};
    console.warn(JSON.stringify({event:'walking_route_recovery',code:e.code,phase:'lighter_alternatives'}));
    try{response=await calculate(lighter,8000);}
    catch(recovery){
      if(!transient(recovery))throw recovery;
      if(options.via)throw new ApiError('PROVIDER_UNAVAILABLE','The walking route service did not respond after retrying. Try again shortly.',503,true);
      const simpler={...body};delete simpler.alternative_routes;reduced=true;
      console.warn(JSON.stringify({event:'walking_route_recovery',code:recovery.code,phase:'single_route'}));
      try{response=await calculate(simpler,8000);}
      catch(last){if(last.code==='PROVIDER_UNAVAILABLE')throw new ApiError('PROVIDER_UNAVAILABLE','The walking route service did not respond after retrying. Try again shortly.',503,true);throw last;}
    }
  }
  const routes=parseOrs(response,origin,destination);if(!routes.length)throw new ApiError('NO_ROUTES','No walking route found. Choose another destination.',422);
  return routes.map(r=>({...r,alternatives_status:reduced?'TEMPORARILY_UNAVAILABLE':routes.length>1?'AVAILABLE':'ONLY_ONE_FOUND'}));
}
export async function searchPlaces(q,key,request=fetchJson) {
  if(q.length<3)return [];
  // Greater Kolkata, including Howrah and the airport. A focus point alone is not a filter.
  const within=places=>places.filter(p=>p.label&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=22.35&&p.latitude<=22.80&&p.longitude>=88.15&&p.longitude<=88.60);
  const terms=q.toLowerCase().split(/[^a-z0-9]+/).filter(t=>t&&!['kolkata','calcutta','india','west','bengal','wb'].includes(t));
  if(key)try{
    // Try the independent fallback on primary failure as well as missing matches.
    // One bounded attempt per provider keeps the total below Android's 25-second timeout.
    const body=await request(`https://api.openrouteservice.org/geocode/search?text=${encodeURIComponent(q)}&boundary.country=IND&boundary.rect.min_lon=88.15&boundary.rect.min_lat=22.35&boundary.rect.max_lon=88.60&boundary.rect.max_lat=22.80&focus.point.lat=22.56&focus.point.lon=88.35&size=6`,{headers:{Authorization:key}},7000,{singleAttempt:true});
    const places=within((body.features||[]).map(f=>({id:f.properties?.id,label:f.properties?.label,latitude:f.geometry?.coordinates?.[1],longitude:f.geometry?.coordinates?.[0]})));
    const matches=places.filter(p=>terms.every(t=>p.label.toLowerCase().includes(t)));
    if(matches.length)return matches;
  }catch{/* A provider failure must not prevent the other provider from searching. */}
  let body;
  try{
    if(request===fetchJson)await fallbackSlot();
    body=await request(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&viewbox=88.15,22.80,88.60,22.35&bounded=1&limit=6&q=${encodeURIComponent(q)}`,{headers:{'User-Agent':'Waymate/2.0 (Kolkata journey companion)'}},8000,{singleAttempt:true});
  }catch(e){
    if(e.code==='RATE_LIMITED')throw e;
    throw new ApiError('SEARCH_UNAVAILABLE','Place search is temporarily unavailable. Try again shortly or choose the destination on the map.',503,true);
  }
  if(!Array.isArray(body))throw new ApiError('INVALID_PROVIDER_RESPONSE','Place search returned an invalid response.',502,true);
  return within(body.map(p=>({id:String(p.place_id),label:p.display_name,latitude:Number(p.lat),longitude:Number(p.lon)})));
}
