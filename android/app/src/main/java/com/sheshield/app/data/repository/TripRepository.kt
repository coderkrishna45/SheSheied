package com.sheshield.app.data.repository

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.sheshield.app.BuildConfig
import com.sheshield.app.data.model.*
import com.sheshield.app.data.network.NetworkClient
import com.sheshield.app.service.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID

class TripRepository private constructor(private val context: Context) {
    val dao=AppDatabase.get(context).tripDao()
    val activeTrip=dao.observeActiveTrip()
    val history=dao.observeHistory()
    val prefs=context.getSharedPreferences("sheshield_prefs",Context.MODE_PRIVATE)
    val gson=Gson()
    private val mutex=Mutex()
    private val syncMutex=Mutex()
    private val api get()=NetworkClient.create(context)
    private suspend fun queue(event:OutboxEvent){
        val last=dao.queued().maxOfOrNull{it.createdAtMs}?:0L
        dao.enqueue(event.copy(createdAtMs=maxOf(event.createdAtMs,last+1)))
        SyncWorker.schedule(context)
    }
    companion object {
        @Volatile private var instance: TripRepository?=null
        fun get(context: Context)=instance?:synchronized(this) { instance?:TripRepository(context.applicationContext).also { instance=it } }
    }
    private fun json(value: Any)=gson.toJsonTree(value).asJsonObject
    suspend fun active()=dao.getActiveTrip()
    fun contacts(): List<TrustedContact> = runCatching { gson.fromJson<List<TrustedContact>>(prefs.getString("trusted_contacts","[]"),object:TypeToken<List<TrustedContact>>(){}.type) }.getOrDefault(emptyList())
    suspend fun saveContacts(contacts: List<TrustedContact>)=mutex.withLock {
        prefs.edit().putString("trusted_contacts",gson.toJson(contacts)).apply()
        active()?.takeIf{!it.isRehearsal}?.let{trip->
            dao.upsert(trip.copy(trustedContacts=gson.toJson(contacts),syncStatus="PENDING"))
            queue(OutboxEvent(UUID.randomUUID().toString(),trip.tripId,"v1/trips/${trip.tripId}/contacts",gson.toJson(mapOf("contacts" to contacts))))
        }
    }
    fun demo()=prefs.getBoolean("demo_mode",true)
    fun setDemo(enabled: Boolean){prefs.edit().putBoolean("demo_mode",enabled).apply()}
    suspend fun enroll(){if(prefs.getString("session_token",null)==null){val s=api.enroll(mapOf("enrollment_code" to (prefs.getString("enrollment_code","")?:"")));prefs.edit().putString("session_token",s.token).apply()}}
    suspend fun ready()=api.ready()
    suspend fun search(query:String):List<Place>{enroll();return api.places(query).places}
    private val batteryMutex=Mutex()
    suspend fun sendBatteryHeartbeat(reading:com.sheshield.app.util.BatteryReading)=batteryMutex.withLock {
        val t=active()?.takeUnless{it.isRehearsal}?:return@withLock
        val body=mutableMapOf<String,Any>("percent" to reading.percent,"charging" to reading.charging,"observed_at_ms" to reading.observedAtMs,"enabled" to prefs.getBoolean("battery_protection",true))
        if(System.currentTimeMillis()-t.lastUpdateMs in 0..600000&&t.accuracyMeters in 0f..1000f)
            body["location"]=LocationFix(t.lastLatitude,t.lastLongitude,t.accuracyMeters,t.lastUpdateMs)
        try{
            enroll();val watch=api.batteryHeartbeat(t.tripId,json(body))
            prefs.edit().putLong("battery_registered:${t.tripId}",watch.lastSeenAtMs).putString("battery_state:${t.tripId}",watch.state).remove("battery_error:${t.tripId}").apply()
        }catch(e:kotlinx.coroutines.CancellationException){throw e}
        catch(e:Exception){prefs.edit().putString("battery_error:${t.tripId}",NetworkClient.message(e)).apply();throw e}
    }
    suspend fun batteryWatch(t:ActiveTrip):BatteryWatch{enroll();return api.batteryWatch(t.tripId)}
    suspend fun startBatteryDemo(recipient:TrustedContact?=null):BatteryDemo{enroll();return api.batteryDemo(json(mapOf("contacts" to (recipient?.let{listOf(it)}?:contacts()),"deliver_sms" to (recipient!=null))))}
    suspend fun batteryDemoStatus(id:String)=api.batteryDemoStatus(id)
    suspend fun cancelBatteryDemo(id:String)=api.cancelBatteryDemo(id)
    suspend fun plan(origin:Place?,destination:Place?,avoidAreaIds:List<String> = emptyList()):TripPlan=withContext(Dispatchers.IO){
        require(origin!=null&&destination!=null){"Choose both starting point and destination."}
        enroll();val plan=api.plan(json(mapOf("mode" to if(demo())"REHEARSAL" else "LIVE","origin" to origin,"destination" to destination,"avoid_area_ids" to avoidAreaIds,"condition_preview" to prefs.getBoolean("condition_preview",true))))
        dao.savePlan(SavedPlan(json=gson.toJson(plan)));plan
    }
    suspend fun comparePlan(plan:TripPlan,preference:String,extraMinutes:Int):TripPlan=withContext(Dispatchers.IO){
        enroll();val updated=api.compare(plan.id,json(mapOf("preference" to preference,"max_extra_minutes" to extraMinutes)));dao.savePlan(SavedPlan(json=gson.toJson(updated)));updated
    }
    suspend fun nearby(trip:ActiveTrip):NearbyPlacesResponse{
        check(!trip.isRehearsal){"Nearby walking options use your live GPS position."}
        val fix=com.sheshield.app.util.LocationProvider(context).current();enroll();return api.nearby(trip.tripId,json(mapOf("origin" to fix)))
    }
    suspend fun recordedPlan():TripPlan=withContext(Dispatchers.IO){
        val plan=context.assets.open("rehearsal_plan.json").bufferedReader().use{gson.fromJson(it,TripPlan::class.java)}
        dao.savePlan(SavedPlan(json=gson.toJson(plan)));plan
    }
    suspend fun savedPlan():TripPlan?=dao.getPlan()?.let{runCatching{gson.fromJson(it.json,TripPlan::class.java)}.getOrNull()}
    suspend fun start(plan:TripPlan,route:RouteOption,departure:DepartureProtection=DepartureProtection()):ActiveTrip=mutex.withLock {
        check(dao.getActiveTrip()==null){"Finish your current journey before starting another."}
        val trip=if(plan.mode=="REHEARSAL") ActiveTrip(tripId="LOCAL-${UUID.randomUUID()}",originLat=plan.origin.latitude,originLng=plan.origin.longitude,
            destinationLat=plan.destination.latitude,destinationLng=plan.destination.longitude,destinationLabel=plan.destination.label,
            selectedRouteId=route.routeId,routeJson=gson.toJson(route),mode=plan.mode,trustedContacts="[]")
        else{enroll();val previous=prefs.getString("pending_start_plan",null);val key=if(previous==plan.id+":"+route.routeId)prefs.getString("pending_start_key",null)?:UUID.randomUUID().toString() else UUID.randomUUID().toString()
            prefs.edit().putString("pending_start_plan",plan.id+":"+route.routeId).putString("pending_start_key",key).apply()
            fromRemote(api.start(key,json(mapOf("plan_id" to plan.id,"route_id" to route.routeId,"contacts" to contacts(),"departure_protection" to departure)))).also{prefs.edit().remove("pending_start_plan").remove("pending_start_key").apply()}}
        prefs.edit().putString("departure_protection:${trip.tripId}",gson.toJson(departure)).remove("departure_state:${trip.tripId}").remove("sync_error").putBoolean("replay_paused",false).apply();dao.upsert(trip);trip
    }
    private fun fromRemote(t:RemoteTrip,local:ActiveTrip?=null)=ActiveTrip(tripId=t.id,originLat=t.origin.latitude,originLng=t.origin.longitude,
        destinationLat=t.destination.latitude,destinationLng=t.destination.longitude,destinationLabel=t.destination.label,selectedRouteId=t.route.routeId,
        state=runCatching{TripState.valueOf(t.state)}.getOrDefault(TripState.ACTIVE),startedAtMs=t.startedAtMs,
        lastLatitude=local?.lastLatitude?:t.lastLocation?.latitude?:t.origin.latitude,lastLongitude=local?.lastLongitude?:t.lastLocation?.longitude?:t.origin.longitude,
        lastUpdateMs=local?.lastUpdateMs?:t.lastLocation?.timestampMs?:0,accuracyMeters=local?.accuracyMeters?:t.lastLocation?.accuracy?:0f,
        checkInDeadlineMs=if(t.checkIn?.status=="PENDING")t.checkIn.deadlineMs else 0,checkInId=t.checkIn?.id?:"",trustedContacts=gson.toJson(t.contacts),
        routeJson=gson.toJson(t.route),mode=t.mode,sosId=t.sosId?:"",endedAtMs=t.endedAtMs?:0,version=t.version,
        progressIndex=local?.progressIndex?:0,lastCheckInAtMs=local?.lastCheckInAtMs?:0)
    suspend fun updateLocation(fix:LocationFix,progress:Int)=mutex.withLock {
        val t=active()?:return@withLock
        if(fix.timestampMs<t.lastUpdateMs)return@withLock
        dao.upsert(t.copy(lastLatitude=fix.latitude,lastLongitude=fix.longitude,lastUpdateMs=fix.timestampMs,accuracyMeters=fix.accuracy,progressIndex=progress))
    }
    suspend fun uploadLocation(fix:LocationFix){val t=active()?:return;if(t.isRehearsal)return
        runCatching{enroll();api.location(t.tripId,fix)}.onSuccess{remote->mergeRemote(remote)}.onFailure{mutex.withLock{active()?.let{dao.upsert(it.copy(syncStatus="OFFLINE"))}}}
    }
    fun departureProtection(trip:ActiveTrip):DepartureProtection=runCatching{gson.fromJson(prefs.getString("departure_protection:${trip.tripId}",null),DepartureProtection::class.java)}.getOrNull()?:DepartureProtection()
    fun isDepartureCheck(trip:ActiveTrip)=trip.checkInId.startsWith("departure-")||prefs.getString("check_kind:${trip.tripId}",null)=="DEVIATION"
    private fun rememberCheckIn(remote:RemoteTrip) {
        remote.departureProtection?.let{prefs.edit().putString("departure_protection:${remote.id}",gson.toJson(it)).apply()}
        if(remote.departureGraceUntilMs>0)prefs.edit().putLong("departure_grace:${remote.id}",remote.departureGraceUntilMs).apply()
        remote.checkIn?.let { event ->
            prefs.edit().putString("server_event:${remote.id}",event.id)
                .putString("check_kind:${remote.id}",event.kind?:"SEGMENT").putBoolean("delivery_ready:${remote.id}",event.deliveryReady)
                .putLong("companion_seen:${remote.id}",event.companionSeenAtMs?:0L).apply()
        }
    }
    private suspend fun mergeRemote(remote:RemoteTrip)=mutex.withLock {
        val local=dao.getTripById(remote.id)?:return@withLock
        if(local.isEnded||remote.version<local.version)return@withLock
        rememberCheckIn(remote)
        if(dao.queued().any{it.tripId==remote.id})return@withLock
        // Rejected or stale offline proof must not silently cancel the phone's unanswered check.
        if(local.state==TripState.CHECK_IN_PENDING&&isDepartureCheck(local)&&remote.state=="ACTIVE"&&remote.checkIn?.id!=local.checkInId)return@withLock
        // A fresh authoritative ACTIVE response completes recovery even if an offline SAFE command was rejected.
        if(remote.state=="ACTIVE"&&remote.checkIn?.status!="PENDING")prefs.edit().remove("disarm_pending:${remote.id}").apply()
        dao.upsert(fromRemote(remote,local))
    }
    suspend fun checkIn(segmentId:String)=mutex.withLock {
        val t=active()?:return@withLock
        if(t.state!=TripState.ACTIVE||System.currentTimeMillis()-t.lastCheckInAtMs<60000)return@withLock
        prefs.edit().putString("check_kind:${t.tripId}","SEGMENT").apply()
        val eventId=UUID.randomUUID().toString()
        val deadline=System.currentTimeMillis()+if(t.isRehearsal)20000 else 300000
        dao.upsert(t.copy(state=TripState.CHECK_IN_PENDING,checkInId=eventId,checkInDeadlineMs=deadline,lastCheckInAtMs=System.currentTimeMillis(),syncStatus=if(t.isRehearsal)"SYNCED" else "PENDING"))
        if(!t.isRehearsal)queue(OutboxEvent(eventId,t.tripId,"v1/trips/${t.tripId}/check-ins",gson.toJson(mapOf("event_id" to eventId,"segment_id" to segmentId,"deadline_ms" to deadline,
            "location" to LocationFix(t.lastLatitude,t.lastLongitude,t.accuracyMeters,t.lastUpdateMs,t.lastUpdateMs)))))
    }
    suspend fun departureCheck(readings:List<LocationFix>,revision:Int)=mutex.withLock {
        val t=active()?:return@withLock
        val protection=departureProtection(t)
        if(!protection.enabled||t.state!=TripState.ACTIVE||prefs.getBoolean("disarm_pending:${t.tripId}",false)||t.route()?.revision!=revision||System.currentTimeMillis()<prefs.getLong("departure_grace:${t.tripId}",0))return@withLock
        val eventId="departure-${UUID.randomUUID()}";val deadline=System.currentTimeMillis()+protection.windowSeconds*1000L
        prefs.edit().putString("check_kind:${t.tripId}","DEVIATION").remove("departure_state:${t.tripId}").apply()
        dao.upsert(t.copy(state=TripState.CHECK_IN_PENDING,checkInId=eventId,checkInDeadlineMs=deadline,lastCheckInAtMs=System.currentTimeMillis(),syncStatus=if(t.isRehearsal)"SYNCED" else "PENDING"))
        if(!t.isRehearsal)queue(OutboxEvent(eventId,t.tripId,"v1/trips/${t.tripId}/check-ins",gson.toJson(mapOf("event_id" to eventId,"kind" to "DEVIATION","window_seconds" to protection.windowSeconds,"deadline_ms" to deadline,"route_revision" to revision,"fixes" to readings))))
    }
    suspend fun armWatch(seconds:Int)=mutex.withLock {
        require(seconds in 20..1800){"Choose a watch lasting up to 30 minutes."}
        val t=active()?:error("Start a journey first.")
        check(t.state==TripState.ACTIVE){"Resolve the current check-in before starting another watch."}
        check(t.isRehearsal||seconds>=60){"Choose at least one minute."}
        prefs.edit().putString("check_kind:${t.tripId}","PERSONAL").apply()
        val eventId="watch-${UUID.randomUUID()}"
        val deadline=System.currentTimeMillis()+seconds*1000L
        dao.upsert(t.copy(state=TripState.CHECK_IN_PENDING,checkInId=eventId,checkInDeadlineMs=deadline,
            lastCheckInAtMs=System.currentTimeMillis(),syncStatus=if(t.isRehearsal)"SYNCED" else "PENDING"))
        if(!t.isRehearsal){
            val body=mutableMapOf<String,Any>("event_id" to eventId,"kind" to "PERSONAL","window_seconds" to seconds,"deadline_ms" to deadline)
            if(System.currentTimeMillis()-t.lastUpdateMs in 0..60000 && t.accuracyMeters in 0f..50f)
                body["location"]=LocationFix(t.lastLatitude,t.lastLongitude,t.accuracyMeters,t.lastUpdateMs)
            queue(OutboxEvent(eventId,t.tripId,"v1/trips/${t.tripId}/check-ins",gson.toJson(body)))
        }
    }
    suspend fun confirmSafe(){val expired=mutex.withLock{
        val t=active()?:return@withLock false;if(t.state!=TripState.CHECK_IN_PENDING)return@withLock false
        if(t.checkInDeadlineMs>0&&System.currentTimeMillis()>=t.checkInDeadlineMs)return@withLock true
        if(isDepartureCheck(t))prefs.edit().putLong("departure_grace:${t.tripId}",System.currentTimeMillis()+180000).remove("departure_state:${t.tripId}").apply()
        if(!t.isRehearsal)prefs.edit().putBoolean("disarm_pending:${t.tripId}",true).apply()
        dao.upsert(t.copy(state=TripState.ACTIVE,checkInDeadlineMs=0,syncStatus=if(t.isRehearsal)"SYNCED" else "PENDING"))
        if(!t.isRehearsal)queue(OutboxEvent(UUID.randomUUID().toString(),t.tripId,"v1/trips/${t.tripId}/check-ins/${t.checkInId}/resolve",gson.toJson(mapOf("status" to "SAFE","resolved_at_ms" to System.currentTimeMillis()))))
        false
    };if(expired)createSos("TIMEOUT")}
    suspend fun end(cancelled:Boolean=false)=mutex.withLock {
        val t=active()?:return@withLock
        if(!t.isRehearsal)prefs.edit().putBoolean("disarm_pending:${t.tripId}",true).apply()
        dao.upsert(t.copy(state=if(cancelled)TripState.CANCELLED else TripState.COMPLETED,endedAtMs=System.currentTimeMillis(),checkInDeadlineMs=0,syncStatus=if(t.isRehearsal)"SYNCED" else "PENDING"))
        if(t.sosId.isNotBlank())cancelIncidentLocal(t.sosId)
        if(!t.isRehearsal){dao.queued().filter{it.tripId==t.tripId&&(it.path.contains("check-ins")||it.path=="v1/sos")}.forEach{dao.acknowledge(it.id)}
            queue(OutboxEvent(UUID.randomUUID().toString(),t.tripId,"v1/trips/${t.tripId}/end",gson.toJson(mapOf("cancelled" to cancelled))))}
    }
    suspend fun createSos(trigger:String,standaloneLocation:LocationFix?=null):SosIncident {val result=mutex.withLock {
        val t=active();if(t?.sosId?.isNotBlank()==true)incident(t.sosId,false)?.let{return@withLock it}
        val mode=t?.mode?:if(demo())"REHEARSAL" else "LIVE"
        if(t==null)prefs.getString("latest_sos",null)?.let{latest->incident(latest,false)?.takeIf{!it.cancelled&&it.mode==mode&&it.tripId==null&&it.status in listOf("REQUESTED","CONTACTING","PENDING","REQUEST_UNKNOWN")&&System.currentTimeMillis()-it.createdAtMs<300000}?.let{return@withLock it}}
        val key=UUID.randomUUID().toString()
        val loc=standaloneLocation?:t?.takeIf{it.lastUpdateMs>0}?.let{LocationFix(it.lastLatitude,it.lastLongitude,it.accuracyMeters,it.lastUpdateMs)}
        val recipients=if(t!=null)runCatching{gson.fromJson<List<TrustedContact>>(t.trustedContacts,object:TypeToken<List<TrustedContact>>(){}.type)}.getOrDefault(emptyList())else contacts()
        val incident=SosIncident(id="LOCAL-SOS-$key",tripId=t?.tripId,mode=mode,status=if(mode=="REHEARSAL")"REQUESTED" else "PENDING",
            location=loc,contacts=if(mode=="REHEARSAL")listOf(TrustedContact("Aditi (demo)","+910000000001"),TrustedContact("Riya (demo)","+910000000002"))else recipients,
            timeline=listOf(TimelineEvent(key,"REQUESTED",if(mode=="REHEARSAL")"Rehearsal alert. No real messages or calls." else "SOS saved on this phone; contacting available channels.",atMs=System.currentTimeMillis())),createdAtMs=System.currentTimeMillis())
        dao.saveIncident(SavedIncident(incident.id,gson.toJson(incident)));prefs.edit().putString("latest_sos",incident.id).apply()
        if(t!=null)dao.upsert(t.copy(state=TripState.SOS_ACTIVE,sosId=incident.id,checkInDeadlineMs=0))
        if(mode!="REHEARSAL"){
            val body=mutableMapOf<String,Any>("mode" to mode,"trigger" to trigger,"check_in_kind" to if(t!=null&&isDepartureCheck(t))"DEVIATION" else "PERSONAL","contacts" to recipients);if(t!=null)body["trip_id"]=t.tripId;if(loc!=null)body["location"]=loc
            queue(OutboxEvent(key,t?.tripId?:"","v1/sos",gson.toJson(body),expiresAtMs=System.currentTimeMillis()+300000))
        }
        incident
    }
        com.sheshield.app.util.NotificationHelper.showSos(context,result)
        if(result.mode!="REHEARSAL"&&prefs.getBoolean("device_sms",false))com.sheshield.app.util.SmsHelper.sendSosMessages(context,result.contacts.map{it.phone},result.location,result.id)
        return result
    }
    suspend fun incident(id:String,refresh:Boolean=true):SosIncident? {
        val saved=dao.getIncident(id)?:return null;var incident=gson.fromJson(saved.json,SosIncident::class.java)
        if(incident.mode=="REHEARSAL"&&!incident.cancelled){
            val elapsed=System.currentTimeMillis()-incident.createdAtMs
            val states=listOf(0L to "Rehearsal SOS saved",2000L to "Calling Aditi (demo)",6000L to "Aditi: no answer",8000L to "Calling Riya (demo)",12000L to "Riya acknowledged the alert")
            incident=incident.copy(status=if(elapsed>=12000)"ACKNOWLEDGED" else "CONTACTING",timeline=states.filter{elapsed>=it.first}.mapIndexed{i,p->TimelineEvent("demo-$i",if(i==4)"ACKNOWLEDGED" else "SIMULATED",p.second,atMs=incident.createdAtMs+p.first)})
        }else if(refresh&&!id.startsWith("LOCAL"))runCatching{api.incident(id)}.onSuccess{incident=it}
        dao.saveIncident(SavedIncident(incident.id,gson.toJson(incident)));return incident
    }
    private suspend fun cancelIncidentLocal(id:String){val old=incident(id,false)?:return;dao.saveIncident(SavedIncident(id,gson.toJson(old.copy(cancelled=true,status="CANCELLED",timeline=old.timeline+TimelineEvent(UUID.randomUUID().toString(),"CANCELLED","Future escalation cancelled. Sent messages cannot be recalled.",atMs=System.currentTimeMillis())))))}
    suspend fun cancelSos()=mutex.withLock{
        val id=prefs.getString("latest_sos",null)?:return@withLock;cancelIncidentLocal(id)
        if(!id.startsWith("LOCAL"))queue(OutboxEvent(UUID.randomUUID().toString(),"","v1/sos/$id/cancel","{}"))
        else dao.queued().filter{it.path=="v1/sos"&&"LOCAL-SOS-${it.id}"==id}.forEach{dao.acknowledge(it.id)}
        active()?.let{dao.upsert(it.copy(state=TripState.ACTIVE,sosId="",checkInDeadlineMs=0,lastCheckInAtMs=System.currentTimeMillis()))}
    }
    suspend fun sync()=syncMutex.withLock {
        // Upgrade existing journeys too: older versions kept only the Circle
        // snapshot from journey start. Existing SOS incidents remain immutable.
        mutex.withLock {
            active()?.takeIf{!it.isRehearsal}?.let{trip->
                val saved=gson.toJson(contacts())
                if(trip.trustedContacts!=saved){
                    dao.upsert(trip.copy(trustedContacts=saved,syncStatus="PENDING"))
                    queue(OutboxEvent(UUID.randomUUID().toString(),trip.tripId,"v1/trips/${trip.tripId}/contacts",gson.toJson(mapOf("contacts" to contacts()))))
                }
            }
        }
        while(true){val e=dao.queued().firstOrNull()?:break
            if(e.expiresAtMs>0&&System.currentTimeMillis()>e.expiresAtMs){dao.acknowledge(e.id);val message="An unsent alert expired while offline. Use the call or SMS options if help is still needed.";repoError(message);markAlertFailure(e,"EXPIRED",message);continue}
            try{enroll();val result=api.command(e.path,e.id,gson.fromJson(e.payload,JsonObject::class.java))
                if(e.path=="v1/sos"){
                    val incident=gson.fromJson(result,SosIncident::class.java)
                    mutex.withLock{
                        val local=dao.getIncident("LOCAL-SOS-${e.id}")?.let{gson.fromJson(it.json,SosIncident::class.java)}
                        val ended=e.tripId.isNotBlank()&&dao.getTripById(e.tripId)?.isEnded==true
                        if(local?.cancelled==true||ended){
                            dao.saveIncident(SavedIncident(incident.id,gson.toJson(incident.copy(cancelled=true,status="CANCELLED"))))
                            queue(OutboxEvent(UUID.randomUUID().toString(),e.tripId,"v1/sos/${incident.id}/cancel","{}"))
                        }else{
                            dao.saveIncident(SavedIncident(incident.id,gson.toJson(incident)))
                            prefs.edit().putString("latest_sos",incident.id).putString("sms_incident:${incident.id}","LOCAL-SOS-${e.id}").apply()
                            active()?.takeIf{it.tripId==e.tripId}?.let{dao.upsert(it.copy(sosId=incident.id))}
                        }
                    }
                }
                if(e.path.contains("check-ins")) {
                    rememberCheckIn(gson.fromJson(result,RemoteTrip::class.java))
                    if(e.path.endsWith("/resolve"))prefs.edit().remove("disarm_pending:${e.tripId}").apply()
                }
                if(e.path.endsWith("/end"))prefs.edit().remove("disarm_pending:${e.tripId}").apply()
                dao.acknowledge(e.id)
            }catch(error:Exception){
                if(error is retrofit2.HttpException && error.code() in listOf(400,404,409,410,422)){dao.acknowledge(e.id);repoError(NetworkClient.message(error));markAlertFailure(e,"FAILED",NetworkClient.message(error));continue}
                return@withLock
            }
        }
        active()?.takeUnless{it.isRehearsal}?.let{runCatching{api.trip(it.tripId)}.onSuccess{mergeRemote(it)}}
    }
    private suspend fun markAlertFailure(event:OutboxEvent,status:String,message:String){
        if(event.path!="v1/sos")return
        val local=incident("LOCAL-SOS-${event.id}",false)?:return
        dao.saveIncident(SavedIncident(local.id,gson.toJson(local.copy(status=status,timeline=local.timeline+TimelineEvent(UUID.randomUUID().toString(),status,message,atMs=System.currentTimeMillis())))))
    }
    private fun repoError(message:String){prefs.edit().putString("sync_error",message).apply()}
    suspend fun nextDemoCheckIn()=mutex.withLock{active()?.takeIf{it.isRehearsal&&it.state==TripState.ACTIVE}?.let{dao.upsert(it.copy(lastCheckInAtMs=0))}}
    suspend fun share(trip:ActiveTrip):String {check(!trip.isRehearsal){"Practice journeys stay on this phone. Live journeys can create a companion link."};enroll();return api.share(trip.tripId).url}
    suspend fun revokeShares(trip:ActiveTrip){enroll();api.revokeShares(trip.tripId)}
    suspend fun deliveryCheck():DeliveryCheck {enroll();return api.deliveryCheck(json(mapOf("contacts" to contacts())))}
    suspend fun sendCompanion(trip:ActiveTrip,contact:TrustedContact):CompanionMessage {
        check(!trip.isRehearsal){"Practice does not send real messages."}
        check(active()?.tripId==trip.tripId){"This journey has ended."}
        check(contacts().any{it.phone==contact.phone}){"Choose someone from your Circle."}
        val choice="${trip.tripId}:${contact.phone}"
        val keyName="companion_key:$choice"
        val key=prefs.getString(keyName,null)?:UUID.randomUUID().toString().also{prefs.edit().putString(keyName,it).apply()}
        enroll();val result=api.companionSms(trip.tripId,key,json(mapOf("contact" to contact)))
        // Retain the key when the response is lost, preventing duplicate messages on a retry.
        prefs.edit().remove(keyName).apply();return result
    }
    suspend fun companionMessage(id:String):CompanionMessage {enroll();return api.companionMessage(id)}
    suspend fun reroute(trip:ActiveTrip,avoidAhead:Int?=null,avoidAreaId:String?=null,viaPlaceId:String?=null):RerouteProposal {
        check(!trip.isRehearsal){"Alternatives from your GPS position are available in live journeys. Practice uses a simulated position."}
        check(active()?.tripId==trip.tripId){"This journey has ended."}
        val fix=com.sheshield.app.util.LocationProvider(context).current()
        check(com.sheshield.app.util.TripMath.validFix(fix)&&fix.accuracy>0&&fix.accuracy<=50){"GPS is uncertain. Wait for a fresh position accurate to 50 m and try again."}
        enroll()
        val remote=api.location(trip.tripId,fix.copy(sequence=fix.timestampMs))
        mergeRemote(remote)
        val body=mutableMapOf<String,Any>("origin" to fix)
        if(avoidAhead!=null)body["avoid_ahead_meters"]=avoidAhead
        if(avoidAreaId!=null)body["avoid_area_id"]=avoidAreaId
        if(viaPlaceId!=null)body["via_place_id"]=viaPlaceId
        return api.reroute(trip.tripId,json(body))
    }
    suspend fun acceptRoute(proposal:RerouteProposal,route:RouteOption){
        check(active()?.tripId==proposal.tripId){"This journey has ended."}
        check(System.currentTimeMillis()<proposal.expiresAtMs){"These alternatives expired. Find another way again."}
        sync()
        val fix=com.sheshield.app.util.LocationProvider(context).current()
        check(com.sheshield.app.util.TripMath.validFix(fix)&&fix.accuracy>0&&fix.accuracy<=50){"Wait for an accurate GPS position before accepting."}
        enroll();api.location(proposal.tripId,fix.copy(sequence=fix.timestampMs))
        val choice="${proposal.proposalId}:${route.routeId}"
        val key=if(prefs.getString("route_choice",null)==choice)prefs.getString("route_choice_key",null)?:UUID.randomUUID().toString() else UUID.randomUUID().toString()
        prefs.edit().putString("route_choice",choice).putString("route_choice_key",key).apply()
        mutex.withLock{
            val local=active()?.takeIf{it.tripId==proposal.tripId&&!it.isEnded}?:error("This journey has ended.")
            check(dao.queued().none{it.tripId==proposal.tripId}){"A check-in update is awaiting server confirmation. Try accepting again after it syncs."}
            val response=api.command("v1/trips/${proposal.tripId}/route",key,json(mapOf("proposal_id" to proposal.proposalId,"route_id" to route.routeId,"route_revision" to route.revision,"expected_check_in_id" to if(local.state==TripState.CHECK_IN_PENDING)local.checkInId else "")))
            val remote=gson.fromJson(response,RemoteTrip::class.java)
            if(remote.version>=local.version)dao.upsert(fromRemote(remote,local).copy(progressIndex=0))
        }
        prefs.edit().putLong("departure_grace:${proposal.tripId}",System.currentTimeMillis()+60000).remove("departure_state:${proposal.tripId}").putInt("off_route_fixes",0).putBoolean("arrival_ready",false).remove("route_choice").remove("route_choice_key").apply()
    }
    suspend fun deleteTrip(trip:ActiveTrip){if(!trip.isRehearsal)runCatching{api.deleteTrip(trip.tripId)};dao.delete(trip.tripId)}
}
