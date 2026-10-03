import {haversine,segmentDistanceKm,validPoint} from './risk.js';
import {ApiError} from './providers.js';

const meters=(a,b)=>haversine(a[1],a[0],b[1],b[0])*1000;
export function freshOrigin(fix,now) {
  if(!fix||!validPoint([fix.longitude,fix.latitude])||!Number.isFinite(fix.timestamp_ms)||
    now-fix.timestamp_ms>60000||now-fix.timestamp_ms< -5000||
    !Number.isFinite(fix.accuracy_meters)||fix.accuracy_meters<=0||fix.accuracy_meters>50)
    throw new ApiError('FRESH_GPS_REQUIRED','Wait for a fresh GPS position accurate to 50 m before changing route.',422,true);
  return [fix.longitude,fix.latitude];
}
export function remainingGeometry(geometry,origin) {
  let best=Infinity,index=0,fraction=0;
  const scale=Math.cos(origin[1]*Math.PI/180);
  for(let i=0;i<geometry.length-1;i++){
    const a=geometry[i],b=geometry[i+1],x=(a[0]-origin[0])*scale,y=a[1]-origin[1],dx=(b[0]-a[0])*scale,dy=b[1]-a[1];
    const f=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x+f*dx,y+f*dy);
    if(d<best){best=d;index=i;fraction=f;}
  }
  const a=geometry[index],b=geometry[index+1];
  return [[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction],...geometry.slice(index+1)];
}
export function pointAhead(geometry,origin,distance) {
  const rest=remainingGeometry(geometry,origin);
  for(let i=0;i<rest.length-1;i++){
    const length=meters(rest[i],rest[i+1]);
    if(length>=distance){const f=distance/length;return rest[i].map((v,j)=>v+(rest[i+1][j]-v)*f);}
    distance-=length;
  }
  throw new ApiError('NEAR_DESTINATION','The destination is closer than that stretch. Choose other walking options.',422);
}
export function avoidancePolygon(areas) {
  const polygons=areas.map(({center,radius_meters})=>{
    // Circumscribed ring keeps the complete requested circle inside the polygon.
    const radius=radius_meters/Math.cos(Math.PI/16),scale=Math.cos(center[1]*Math.PI/180);
    const ring=Array.from({length:16},(_,i)=>{const angle=i*Math.PI/8;return [center[0]+Math.cos(angle)*radius/(111320*scale),center[1]+Math.sin(angle)*radius/111320];});
    ring.push(ring[0]);return [ring];
  });
  return polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons};
}
export function avoidsAreas(route,areas) {
  return areas.every(area=>route.geometry.slice(1).every((p,i)=>
    segmentDistanceKm(area.center,route.geometry[i],p)*1000>area.radius_meters));
}
export function differentAhead(candidate,current,origin) {
  const rest=remainingGeometry(current.geometry,origin);
  if(meters(rest[0],origin)>60)return true; // Rejoining after leaving the path is useful.
  let walked=0,different=0;
  for(let i=0;i<candidate.geometry.length-1&&walked<500;i++){
    const a=candidate.geometry[i],b=candidate.geometry[i+1],length=meters(a,b),steps=Math.max(1,Math.ceil(length/20));
    for(let j=0;j<steps&&walked<500;j++){
      const p=a.map((v,k)=>v+(b[k]-v)*(j+.5)/steps);
      const distance=Math.min(...rest.slice(1).map((v,k)=>segmentDistanceKm(p,rest[k],v)*1000));
      if(distance>25)different+=length/steps;
      walked+=length/steps;
    }
  }
  return different>=40;
}
