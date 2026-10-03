package com.sheshield.app.util

import com.sheshield.app.data.model.*
import kotlin.math.*

object TripMath {
    data class Projection(val index:Int,val distanceMeters:Double,val fraction:Double,val remainingMeters:Double)
    fun distance(a:LatLng,b:LatLng):Double {
        val dLat=Math.toRadians(b.latitude-a.latitude);val dLng=Math.toRadians(b.longitude-a.longitude)
        val h=sin(dLat/2).pow(2)+cos(Math.toRadians(a.latitude))*cos(Math.toRadians(b.latitude))*sin(dLng/2).pow(2)
        return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
    }
    fun project(point:LatLng,route:RouteOption):Projection {
        val points=route.points
        if(points.size<2)return Projection(0,Double.POSITIVE_INFINITY,0.0,0.0)
        val scale=cos(Math.toRadians(point.latitude));var best=Double.POSITIVE_INFINITY;var idx=0;var fraction=0.0
        for(i in 0 until points.lastIndex){
            val a=points[i];val b=points[i+1]
            val x1=Math.toRadians(a.longitude-point.longitude)*6371000*scale;val y1=Math.toRadians(a.latitude-point.latitude)*6371000
            val dx=Math.toRadians(b.longitude-a.longitude)*6371000*scale;val dy=Math.toRadians(b.latitude-a.latitude)*6371000
            val denom=dx*dx+dy*dy;val t=if(denom==0.0)0.0 else (-(x1*dx+y1*dy)/denom).coerceIn(0.0,1.0)
            val d=hypot(x1+t*dx,y1+t*dy)
            if(d<best){best=d;idx=i;fraction=t}
        }
        var remaining=distance(points[idx],points[idx+1])*(1-fraction)
        for(i in idx+1 until points.lastIndex)remaining+=distance(points[i],points[i+1])
        return Projection(idx,best,fraction,remaining)
    }
    fun validFix(fix:LocationFix,now:Long=System.currentTimeMillis())=fix.latitude.isFinite()&&fix.longitude.isFinite()&&abs(fix.latitude)<=90&&abs(fix.longitude)<=180&&fix.accuracy in 0f..100f&&now-fix.timestampMs in -5000..60000
    fun bearing(a:LatLng,b:LatLng):Double {
        val delta=Math.toRadians(b.longitude-a.longitude);val lat1=Math.toRadians(a.latitude);val lat2=Math.toRadians(b.latitude)
        return (Math.toDegrees(atan2(sin(delta)*cos(lat2),cos(lat1)*sin(lat2)-sin(lat1)*cos(lat2)*cos(delta)))+360)%360
    }
    /** GPS movement must exceed uncertainty; jumps and long gaps do not establish heading. */
    fun movementBearing(from:LocationFix,to:LocationFix):Double? {
        if(!validFix(from)||!validFix(to)||from.accuracy<=0||to.accuracy<=0||from.accuracy>50||to.accuracy>50)return null
        val seconds=(to.timestampMs-from.timestampMs)/1000.0
        if(seconds !in 1.0..30.0)return null
        val a=LatLng(from.latitude,from.longitude);val b=LatLng(to.latitude,to.longitude);val meters=distance(a,b)
        if(meters<maxOf(12.0,(from.accuracy+to.accuracy).toDouble())||meters/seconds>6)return null
        return bearing(a,b)
    }
    /** Look ahead along the path so tiny geometry pieces do not spin the walking map. */
    fun navigationBearing(route:RouteOption,fix:LocationFix):Double? {
        if(!validFix(fix)||fix.accuracy<=0||fix.accuracy>50||route.geometry.size<2)return null
        val p=project(LatLng(fix.latitude,fix.longitude),route)
        if(p.distanceMeters>maxOf(40.0,fix.accuracy.toDouble())||p.remainingMeters<2)return null
        val points=route.points;val a=points[p.index];val b=points[p.index+1]
        val start=LatLng(a.latitude+(b.latitude-a.latitude)*p.fraction,a.longitude+(b.longitude-a.longitude)*p.fraction)
        var from=start;var ahead=25.0;var target=points.last()
        for(i in p.index+1..points.lastIndex){val to=points[i];val length=distance(from,to)
            if(length>=ahead){val f=ahead/length;target=LatLng(from.latitude+(to.latitude-from.latitude)*f,from.longitude+(to.longitude-from.longitude)*f);break}
            ahead-=length;from=to
        }
        return bearing(start,target)
    }
}
