package com.sheshield.app.service

import android.content.Intent
import android.os.Looper
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.*
import com.sheshield.app.data.model.*
import com.sheshield.app.data.repository.TripRepository
import com.sheshield.app.util.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.withLock

class TripTrackingService:LifecycleService() {
    companion object {
        const val ACTION_START="com.sheshield.app.START"
        const val ACTION_STOP="com.sheshield.app.STOP"
        const val ACTION_SAFE="com.sheshield.app.SAFE"
        const val ACTION_SOS="com.sheshield.app.SOS"
        const val ACTION_SKIP="com.sheshield.app.SKIP"
        const val ACTION_PAUSE="com.sheshield.app.PAUSE"
        const val EXTRA_TRIP_ID="trip_id"
        const val EXTRA_EVENT_ID="event_id"
    }
    private val repo by lazy{TripRepository.get(this)}
    private val fused by lazy{LocationServices.getFusedLocationProviderClient(this)}
    private var loop:Job?=null
    private var replayIndex=0
    private var lastHeartbeat=0L
    private var arrivalSince=0L
    private var candidate=""
    private var consecutive=0
    private var callbackRegistered=false
    private val fixMutex=kotlinx.coroutines.sync.Mutex()
    private val locationCallback=object:LocationCallback(){override fun onLocationResult(result:LocationResult){result.lastLocation?.let{loc->lifecycleScope.launch{handleFix(LocationFix(loc.latitude,loc.longitude,loc.accuracy,loc.time,loc.time))}}}}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        super.onStartCommand(intent,flags,startId)
        lifecycleScope.launch{
            val trip=repo.active()
            when(intent?.action){
                ACTION_STOP->{if(trip?.tripId!=intent.getStringExtra(EXTRA_TRIP_ID))return@launch;repo.end();NotificationHelper.cancelCheckInNotification(this@TripTrackingService);stopTracking();lifecycleScope.launch(Dispatchers.IO){repo.sync()}}
                ACTION_SAFE->{if(trip!=null&&trip.tripId==intent.getStringExtra(EXTRA_TRIP_ID)&&trip.checkInId==intent.getStringExtra(EXTRA_EVENT_ID)){repo.confirmSafe();NotificationHelper.cancelCheckInNotification(this@TripTrackingService);repo.sync()}}
                ACTION_SOS->{if(intent.hasExtra(EXTRA_TRIP_ID)&&trip?.tripId!=intent.getStringExtra(EXTRA_TRIP_ID))return@launch;triggerSos("MANUAL")}
                ACTION_SKIP->{val route=trip?.takeIf{it.isRehearsal}?.route();val segment=route?.segments?.firstOrNull{it.level in listOf("MEDIUM","HIGH")};if(segment!=null){repo.nextDemoCheckIn();replayIndex=segment.startIndex+1;candidate=segment.level;consecutive=1}}
                ACTION_PAUSE->repo.prefs.edit().putBoolean("replay_paused",!repo.prefs.getBoolean("replay_paused",false)).apply()
                else->if(trip!=null)startTracking(trip)else stopSelf()
            }
        }
        return START_STICKY
    }
    private fun startTracking(trip:ActiveTrip){
        startForeground(NotificationHelper.NOTIF_TRIP_ACTIVE_ID,NotificationHelper.tripNotification(this,trip,"Monitoring your journey"))
        replayIndex=trip.progressIndex
        repo.prefs.edit().putInt("off_route_fixes",0).putBoolean("arrival_ready",false).apply()
        if(!trip.isRehearsal&&!callbackRegistered){
            if(!LocationProvider(this).permitted()){repo.prefs.edit().putString("tracking_problem","Location permission is unavailable").apply();stopSelf();return}
            try{fused.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000).setMinUpdateIntervalMillis(3000).build(),locationCallback,Looper.getMainLooper());callbackRegistered=true}
            catch(e:SecurityException){repo.prefs.edit().putString("tracking_problem","Location access was revoked").apply();stopSelf();return}
        }
        repo.prefs.edit().remove("tracking_problem").apply()
        if(loop?.isActive==true)return
        loop=lifecycleScope.launch{
            var ticks=0
            while(isActive){
                val current=repo.active()?:break
                if(current.isRehearsal&&ticks%2==0&&current.state==TripState.ACTIVE&&!repo.prefs.getBoolean("replay_paused",false)){
                    val points=current.route()?.points.orEmpty()
                    if(points.isNotEmpty()){val p=points[replayIndex.coerceIn(0,points.lastIndex)];handleFix(LocationFix(p.latitude,p.longitude,5f,System.currentTimeMillis(),System.currentTimeMillis()));if(replayIndex<points.lastIndex)replayIndex=(replayIndex+2).coerceAtMost(points.lastIndex)}
                }
                if(current.state==TripState.CHECK_IN_PENDING){
                    NotificationHelper.showCheckInNotification(this@TripTrackingService,current)
                    if(current.checkInDeadlineMs>0&&System.currentTimeMillis()>=current.checkInDeadlineMs)triggerSos("TIMEOUT")
                }
                if(ticks%15==0)launch(Dispatchers.IO){repo.sync()}
                if(!current.isRehearsal&&ticks%30==0)launch(Dispatchers.IO){
                    BatteryReading.current(this@TripTrackingService)?.let{reading->
                        try{repo.sendBatteryHeartbeat(reading)}catch(e:CancellationException){throw e}catch(_:Exception){/* Keep the server's last accepted heartbeat; retry with a new reading. */}
                    }
                }
                if(ticks%5==0)NotificationHelper.updateTrip(this@TripTrackingService,current,status(current))
                ticks++;delay(1000)
            }
            stopTracking()
        }
    }
    private fun status(t:ActiveTrip)=when{
        t.state==TripState.SOS_ACTIVE->"SOS active · open for contact updates"
        t.state==TripState.CHECK_IN_PENDING->"Safety check-in pending"
        t.lastUpdateMs==0L||System.currentTimeMillis()-t.lastUpdateMs>60000->"Waiting for a fresh location"
        t.syncStatus=="OFFLINE"->"Local monitoring · server connection unavailable"
        repo.prefs.getString("battery_state:${t.tripId}","")=="ARMED"->"Low battery watch registered on the server"
        t.isRehearsal->"Rehearsal · simulated location"
        else->"Monitoring your journey"
    }
    private suspend fun handleFix(fix:LocationFix)=fixMutex.withLock {
        val trip=repo.active()?:return@withLock;val route=trip.route()?:return@withLock
        if(fix.timestampMs<=trip.lastUpdateMs)return@withLock
        if(!TripMath.validFix(fix)){repo.prefs.edit().putString("tracking_problem","GPS is uncertain; precise route checks paused").apply();repo.prefs.edit().remove("departure_state:${trip.tripId}").apply();return@withLock}
        repo.prefs.edit().remove("tracking_problem").apply()
        val projection=TripMath.project(LatLng(fix.latitude,fix.longitude),route)
        repo.updateLocation(fix,projection.index)
        if(repo.active()?.route()?.revision!=route.revision)return@withLock
        val segment=route.segments.firstOrNull{trip.isRehearsal&&route.isDemoData&&it.startIndex==projection.index&&it.level in listOf("MEDIUM","HIGH")}
        if(segment!=null&&projection.distanceMeters<50&&fix.accuracy<=50){
            if(candidate==segment.level)consecutive++ else{candidate=segment.level;consecutive=1}
            if(consecutive>=2&&trip.state==TripState.ACTIVE){repo.checkIn(segment.id);repo.active()?.takeIf{it.state==TripState.CHECK_IN_PENDING}?.let{NotificationHelper.showCheckInNotification(this,it)}}
        }else{candidate="";consecutive=0}
        if(repo.departureProtection(trip).enabled&&trip.state==TripState.ACTIVE&&System.currentTimeMillis()>=repo.prefs.getLong("departure_grace:${trip.tripId}",0)){
            val old=runCatching{repo.gson.fromJson(repo.prefs.getString("departure_state:${trip.tripId}",null),DepartureDetector.State::class.java)}.getOrNull()?:DepartureDetector.State()
            val departure=DepartureDetector.update(old,fix,route,LatLng(trip.originLat,trip.originLng),LatLng(trip.destinationLat,trip.destinationLng),System.currentTimeMillis())
            repo.prefs.edit().putString("departure_state:${trip.tripId}",repo.gson.toJson(departure.state)).apply()
            if(departure.confirmed){repo.departureCheck(departure.state.readings,route.revision);repo.active()?.takeIf{it.state==TripState.CHECK_IN_PENDING}?.let{NotificationHelper.showCheckInNotification(this,it)};lifecycleScope.launch(Dispatchers.IO){repo.sync()}}
        }
        val off=repo.prefs.getInt("off_route_fixes",0)
        repo.prefs.edit().putInt("off_route_fixes",if(projection.distanceMeters>60)off+1 else 0).apply()
        val near=TripMath.distance(LatLng(fix.latitude,fix.longitude),LatLng(trip.destinationLat,trip.destinationLng))<40
        if(near){if(arrivalSince==0L)arrivalSince=System.currentTimeMillis()}else arrivalSince=0L
        repo.prefs.edit().putBoolean("arrival_ready",arrivalSince>0&&System.currentTimeMillis()-arrivalSince>=15000).apply()
        if(!trip.isRehearsal&&System.currentTimeMillis()-lastHeartbeat>30000){lastHeartbeat=System.currentTimeMillis();lifecycleScope.launch(Dispatchers.IO){repo.uploadLocation(fix)}}
    }
    private suspend fun triggerSos(trigger:String){
        val incident=repo.createSos(trigger)
        NotificationHelper.cancelCheckInNotification(this)
        NotificationHelper.showSos(this,incident)
        lifecycleScope.launch(Dispatchers.IO){repo.sync()}
    }
    private fun stopTracking(){loop?.cancel();loop=null;if(callbackRegistered)fused.removeLocationUpdates(locationCallback);callbackRegistered=false;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onDestroy(){loop?.cancel();if(callbackRegistered)fused.removeLocationUpdates(locationCallback);super.onDestroy()}
}
