import {haversine,segmentDistanceKm,validPoint} from './risk.js';
import {ApiError} from './providers.js';

export const DEVIATION_POLICY={sustain_ms:45000,max_gap_ms:20000,max_accuracy_meters:35,min_distance_meters:60,grace_ms:180000};
export function protection(input) {
 if(input==null)return {enabled:false,window_seconds:120};
 if(typeof input.enabled!=='boolean'||![120,300].includes(input.window_seconds))throw new ApiError('INVALID_PROTECTION','Choose a 2 or 5 minute departure check-in.');
 return {enabled:input.enabled,window_seconds:input.window_seconds};
}
export function departureDistance(fix,route) {
 const p=[fix.longitude,fix.latitude];
 return Math.min(...route.geometry.slice(1).map((v,i)=>segmentDistanceKm(p,route.geometry[i],v)*1000));
}
export function validateDeparture(trip,body,now) {
 if(!trip.departure_protection?.enabled)throw new ApiError('PROTECTION_DISABLED','Departure check-ins are disabled for this journey.',409);
 if(body.route_revision!==trip.route.route_revision)throw new ApiError('ROUTE_CHANGED','Departure readings belong to an older route.',409);
 if(now<(trip.departure_grace_until_ms||0))throw new ApiError('DEPARTURE_GRACE','Departure check-ins are paused briefly after your confirmation.',409);
 const fixes=body.fixes;
 if(!Array.isArray(fixes)||fixes.length<4||fixes.length>20)throw new ApiError('INVALID_DEPARTURE','A sustained departure requires several accurate readings.',422);
 let previous=null;
 for(const f of fixes){
  const p=[f.longitude,f.latitude];
  if(!validPoint(p)||!Number.isFinite(f.timestamp_ms)||f.timestamp_ms>now+5000||f.timestamp_ms<now-120000||!Number.isFinite(f.accuracy_meters)||f.accuracy_meters<=0||f.accuracy_meters>DEVIATION_POLICY.max_accuracy_meters)throw new ApiError('INVALID_DEPARTURE','Departure readings are stale or uncertain.',422);
  if(previous){const gap=f.timestamp_ms-previous.timestamp_ms;
   if(gap<3000||gap>DEVIATION_POLICY.max_gap_ms||haversine(previous.latitude,previous.longitude,f.latitude,f.longitude)*1000/(gap/1000)>6)throw new ApiError('INVALID_DEPARTURE','Departure readings contain a gap or an implausible walking jump.',422);
  }
  if(departureDistance(f,trip.route)<=Math.max(DEVIATION_POLICY.min_distance_meters,2*f.accuracy_meters))throw new ApiError('INVALID_DEPARTURE','Departure is not outside the route and position uncertainty.',422);
  // Entrances can be separated from the provider's walking endpoint.
  for(const [place,snap] of [[trip.origin,trip.route.origin_snap_meters],[trip.destination,trip.route.destination_snap_meters]])
   if(haversine(place.latitude,place.longitude,f.latitude,f.longitude)*1000<=Math.max(50,(snap||0)+25))throw new ApiError('INVALID_DEPARTURE','These readings are near a selected entrance.',422);
  previous=f;
 }
 if(fixes.at(-1).timestamp_ms-fixes[0].timestamp_ms<DEVIATION_POLICY.sustain_ms||now-fixes.at(-1).timestamp_ms>30000)throw new ApiError('INVALID_DEPARTURE','Departure has not persisted or the latest position is stale.',422);
 if(body.window_seconds!==trip.departure_protection.window_seconds)throw new ApiError('INVALID_WINDOW','Use the departure window selected for this journey.');
 return fixes.at(-1);
}
