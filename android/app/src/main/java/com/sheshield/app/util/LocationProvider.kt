package com.sheshield.app.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import com.sheshield.app.data.model.*
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** A GPS timeout is a recoverable result; cancellation of the owning screen still propagates. */
internal suspend fun <T:Any> awaitCurrentLocation(timeoutMillis:Long=15000,request:suspend ()->T?):T =
    withTimeoutOrNull(timeoutMillis){request()}
        ?:error("Could not get a fresh GPS position in time. Check precise location access, move somewhere with a clearer GPS signal, and try again.")

class LocationProvider(private val context:Context) {
    fun permitted()=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
    suspend fun current():LocationFix {
        check(permitted()){ "Allow location access to use your current position." }
        val cancellation=CancellationTokenSource()
        try{
            val loc=awaitCurrentLocation{LocationServices.getFusedLocationProviderClient(context).getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY,cancellation.token).await()}
            return LocationFix(loc.latitude,loc.longitude,loc.accuracy,loc.time)
        }catch(e:SecurityException){error("Location access was revoked. Allow location access in Settings.")}
        finally{cancellation.cancel()}
    }
}
