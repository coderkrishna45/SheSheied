// Cache provider geometry only. Evidence and route preferences are evaluated anew.
export function walkingRouteCache(calculate,now=Date.now){
 const entries=new Map(),pending=new Map(),ttl=300000;
 const geometry=r=>({route_id:r.route_id,geometry:r.geometry,duration_seconds:r.duration_seconds,distance_meters:r.distance_meters,origin_snap_meters:r.origin_snap_meters,destination_snap_meters:r.destination_snap_meters,steps:r.steps||[],alternatives_status:r.alternatives_status});
 const keyFor=(origin,destination,options)=>JSON.stringify([origin,destination,options]);
 function save(key,routes,at){const previous=entries.get(key);if(previous&&now()-previous.at<ttl&&previous.routes.length>routes.length)return;entries.set(key,{routes:routes.map(geometry),at});if(entries.size>100)entries.delete(entries.keys().next().value);}
 async function get(origin,destination,key,options={}){
  const cacheKey=keyFor(origin,destination,options),cached=entries.get(cacheKey);
  if(cached&&now()-cached.at<ttl&&cached.routes[0]?.alternatives_status!=='TEMPORARILY_UNAVAILABLE')return structuredClone(cached.routes);
  if(pending.has(cacheKey))return structuredClone((await pending.get(cacheKey)).map(geometry));
  const request=calculate(origin,destination,key,options);pending.set(cacheKey,request);
  try{const routes=await request;save(cacheKey,routes,now());return structuredClone(entries.get(cacheKey).routes);}
  catch(e){if(cached&&now()-cached.at<ttl)return structuredClone(cached.routes);throw e;}
  finally{pending.delete(cacheKey);}
 }
 // Retain recent real provider results across backend restarts for an ongoing demo.
 get.seed=plans=>{for(const p of plans){
  if(p.geometry_source!=='OpenRouteService walking directions'||now()-p.created_at_ms>=ttl||p.created_at_ms>now()||p.avoid_area_ids?.length||!p.routes?.length||p.routes.some(r=>r.is_demo_data))continue;
  save(keyFor([p.origin.longitude,p.origin.latitude],[p.destination.longitude,p.destination.latitude],{}),p.routes,p.created_at_ms);
 }};
 return get;
}
