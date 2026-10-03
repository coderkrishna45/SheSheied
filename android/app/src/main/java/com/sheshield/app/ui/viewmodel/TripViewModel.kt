package com.sheshield.app.ui.viewmodel

import android.app.Application
import android.content.Intent
import androidx.lifecycle.*
import com.sheshield.app.data.model.*
import com.sheshield.app.data.repository.TripRepository
import com.sheshield.app.service.TripTrackingService
import com.sheshield.app.util.NotificationHelper
import kotlinx.coroutines.launch

class TripViewModel(app:Application):AndroidViewModel(app){
    val repo=TripRepository.get(app)
    val activeTrip=repo.activeTrip.asLiveData()
    val history=repo.history.asLiveData()
    private val _error=MutableLiveData<String>()
    val error:LiveData<String> = _error
    fun startTracking(){getApplication<Application>().startForegroundService(Intent(getApplication(),TripTrackingService::class.java).setAction(TripTrackingService.ACTION_START))}
    fun confirmSafe(){viewModelScope.launch{repo.confirmSafe();NotificationHelper.cancelCheckInNotification(getApplication());repo.active()?.takeIf{it.state==TripState.SOS_ACTIVE}?.let{t->repo.incident(t.sosId,false)?.let{NotificationHelper.showSos(getApplication(),it)}};repo.sync()}}
    fun endTrip(onEnded:()->Unit){viewModelScope.launch{repo.end();getApplication<Application>().stopService(Intent(getApplication(),TripTrackingService::class.java));NotificationHelper.cancelCheckInNotification(getApplication());onEnded();repo.sync()}}
}
class PlanningViewModel(app:Application):AndroidViewModel(app){
    val repo=TripRepository.get(app)
    var origin:Place?=null
    var destination:Place?=null
    var plan:TripPlan?=null
    var selectedRouteId:String?=null
    var busy=false
    fun clearPlan(){plan=null;selectedRouteId=null}
    fun chooseOrigin(place:Place){origin=place;clearPlan()}
    fun chooseDestination(place:Place){destination=place;clearPlan()}
    fun reset(){origin=null;destination=null;clearPlan()}

}
