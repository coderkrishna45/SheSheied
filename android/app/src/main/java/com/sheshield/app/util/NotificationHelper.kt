package com.sheshield.app.util

import android.app.*
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.sheshield.app.R
import com.sheshield.app.data.model.*
import com.sheshield.app.service.TripTrackingService
import com.sheshield.app.ui.MainActivity

object NotificationHelper {
    const val NOTIF_TRIP_ACTIVE_ID=1001
    private const val CHECK=1002
    private const val SOS=1003
    fun createChannels(ctx:Context){val nm=ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("trip","Journey monitoring",NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel("checkin","Safety check-ins",NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel("sos","SOS updates",NotificationManager.IMPORTANCE_HIGH))
    }
    private fun open(ctx:Context,screen:String)=PendingIntent.getActivity(ctx,screen.hashCode(),Intent(ctx,MainActivity::class.java).putExtra("screen",screen),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun action(ctx:Context,action:String,t:ActiveTrip)=PendingIntent.getService(ctx,(action+t.tripId+t.checkInId).hashCode(),Intent(ctx,TripTrackingService::class.java).setAction(action).putExtra(TripTrackingService.EXTRA_TRIP_ID,t.tripId).putExtra(TripTrackingService.EXTRA_EVENT_ID,t.checkInId),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun tripNotification(ctx:Context,t:ActiveTrip,text:String)=NotificationCompat.Builder(ctx,"trip").setSmallIcon(R.drawable.ic_waymate_notification)
        .setContentTitle(if(t.isRehearsal)"Waymate · Rehearsal" else "Waymate · Journey active").setContentText(text)
        .setContentIntent(open(ctx,"trip")).setOngoing(true).setSilent(true).addAction(0,"End journey",action(ctx,TripTrackingService.ACTION_STOP,t)).build()
    fun updateTrip(ctx:Context,t:ActiveTrip,text:String){ctx.getSystemService(NotificationManager::class.java).notify(NOTIF_TRIP_ACTIVE_ID,tripNotification(ctx,t,text))}
    fun showCheckInNotification(ctx:Context,t:ActiveTrip){
        val n=NotificationCompat.Builder(ctx,"checkin").setSmallIcon(R.drawable.ic_waymate_notification).setContentTitle("Are you safe?")
            .setContentText(if(t.checkInId.startsWith("departure-"))"You left your planned route. Confirm you are okay before the countdown ends." else "Confirm before the countdown ends to stop contact escalation.").setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(open(ctx,"trip"))
            .setWhen(t.checkInDeadlineMs).setUsesChronometer(true).setChronometerCountDown(true).setOnlyAlertOnce(true).setOngoing(true)
            .addAction(0,"I'm safe",action(ctx,TripTrackingService.ACTION_SAFE,t)).addAction(0,"SOS",action(ctx,TripTrackingService.ACTION_SOS,t)).build()
        ctx.getSystemService(NotificationManager::class.java).notify(CHECK,n)
    }
    fun cancelCheckInNotification(ctx:Context){ctx.getSystemService(NotificationManager::class.java).cancel(CHECK)}
    fun showSos(ctx:Context,incident:SosIncident){ctx.getSystemService(NotificationManager::class.java).notify(SOS,NotificationCompat.Builder(ctx,"sos").setSmallIcon(R.drawable.ic_waymate_notification)
        .setContentTitle(if(incident.mode=="REHEARSAL")"Rehearsal SOS" else "SOS requested").setContentText("Open to see available contact channels and results.").setContentIntent(open(ctx,"sos")).setOnlyAlertOnce(true).build())}
    fun resume(ctx:Context){ctx.getSystemService(NotificationManager::class.java).notify(NOTIF_TRIP_ACTIVE_ID,NotificationCompat.Builder(ctx,"trip").setSmallIcon(R.drawable.ic_waymate_notification).setContentTitle("Resume your journey")
        .setContentText("Open Waymate to restore location monitoring.").setContentIntent(open(ctx,"trip")).build())}
}
