package com.sheshield.app.util

import com.sheshield.app.data.model.*

/** Sustained walking departure; thresholds are conservative prototype policy, not safety probabilities. */
object DepartureDetector {
    data class State(val routeRevision:Int=0,val readings:List<LocationFix> = emptyList())
    data class Result(val state:State,val confirmed:Boolean=false)
    fun update(state:State,fix:LocationFix,route:RouteOption,origin:LatLng,destination:LatLng,now:Long):Result {
        val empty=State(route.revision)
        val last=state.takeIf{it.routeRevision==route.revision}?.readings?.lastOrNull()
        if(last!=null&&fix.timestampMs<=last.timestampMs)return Result(state)
        if(!TripMath.validFix(fix,now)||fix.accuracy<=0||fix.accuracy>35||now-fix.timestampMs>30000)return Result(empty)
        val p=LatLng(fix.latitude,fix.longitude)
        if(TripMath.project(p,route).distanceMeters<=maxOf(60.0,fix.accuracy*2.0)||
            TripMath.distance(p,origin)<=maxOf(50.0,route.originSnapMeters+25.0)||
            TripMath.distance(p,destination)<=maxOf(50.0,route.destinationSnapMeters+25.0))return Result(empty)
        val gap=last?.let{fix.timestampMs-it.timestampMs}
        val jump=last?.let{TripMath.distance(LatLng(it.latitude,it.longitude),p)/((gap?:1)/1000.0)}?:0.0
        if(gap!=null&&gap<3000)return Result(state)
        val readings=if(last==null||gap!!>20000||jump>6)listOf(fix) else state.readings+fix
        val kept=readings.filter{fix.timestampMs-it.timestampMs<=90000}.takeLast(20)
        return Result(State(route.revision,kept),kept.size>=4&&fix.timestampMs-kept.first().timestampMs>=45000)
    }
}
