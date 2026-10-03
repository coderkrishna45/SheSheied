import {fetchJson} from './providers.js';
import {haversine,validPoint} from './risk.js';

// A reverse-geocoded address is a nearby map label, never a claim of an exact doorway.
export function locationAddressResolver(key,request=fetchJson,now=Date.now){
 const cache=new Map(),pending=new Map();
 return async location=>{
  if(!location||!validPoint([location.longitude,location.latitude])||!key)return null;
  const cacheKey=[location.latitude.toFixed(4),location.longitude.toFixed(4)].join(',');
  const saved=cache.get(cacheKey);if(saved&&now()-saved.at<3600000)return saved.address;
  if(pending.has(cacheKey))return pending.get(cacheKey);
  const lookup=(async()=>{
   try{
    const url=`https://api.openrouteservice.org/geocode/reverse?point.lon=${location.longitude}&point.lat=${location.latitude}&size=1&layers=address,venue,street`;
    const body=await request(url,{headers:{Authorization:key}},3000,{singleAttempt:true});
    const f=body.features?.[0],p=f?.geometry?.coordinates,label=f?.properties?.label;
    if(!validPoint(p)||haversine(location.latitude,location.longitude,p[1],p[0])*1000>200||typeof label!=='string'||!/[a-zA-Z\u0980-\u09ff]/.test(label))return null;
    const address=label.replace(/[\x00-\x1f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
    cache.set(cacheKey,{address,at:now()});if(cache.size>500)cache.delete(cache.keys().next().value);
    return address;
   }catch{return null;}
  })();pending.set(cacheKey,lookup);
  try{return await lookup;}finally{pending.delete(cacheKey);}
 };
}
