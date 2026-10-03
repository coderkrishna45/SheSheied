package com.sheshield.app.ui.components

import android.content.Context
import com.sheshield.app.data.repository.TripRepository
import com.sheshield.app.data.network.NetworkClient
import kotlinx.coroutines.*
import java.text.DateFormat
import java.util.Date
import com.sheshield.app.data.model.TrustedContact

object BatteryProtection {
    suspend fun show(c:Context,repo:TripRepository,scope:CoroutineScope) {
        val trip=repo.active()?.takeUnless{it.isRehearsal}
        val body=Ui.col(c,22)
        body.addView(Ui.text(c,"A backup when your phone goes quiet.",20,true));body.addView(Ui.space(c,12))
        body.addView(Ui.text(c,"During a live journey, 10% battery or lower arms a server watch. If updates stop for 5 minutes, your Circle receives the last recorded location by cloud SMS. The phone may have run out of battery or lost connection.",15))
        body.addView(Ui.space(c,14));val status=Ui.text(c,"",14);body.addView(status)
        if(trip==null)status.text="Start a live journey to register protection. Charging or finishing the journey cancels the watch."
        else {
            val watch=repo.batteryWatch(trip)
            status.text=when(watch.state){
                "ARMED"->"Server watch armed · last battery ${watch.percent}%. SMS follows 5 minutes without an update."
                "ALERTED"->"The phone stopped updating after a low battery reading.\n"+watch.messages.joinToString("\n"){"${it.contact.name}: ${it.status.lowercase().replace('_',' ')}"}
                "RECOVERED"->"Phone reconnected. Pending battery messages are canceled. This episode will not alert again until the battery recovers or charging starts."
                "OFF"->"Battery protection is off for this journey."
                "MONITORING"->"Connected to the server · last battery ${watch.percent}%. Protection arms at 10%."
                else->"Waiting for the first server heartbeat. Remote protection is not confirmed yet."
            }
            watch.location?.let{position->body.addView(Ui.space(c,10));body.addView(Ui.text(c,"Last recorded location: ${position.address?:"saved map position"}\n${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(position.timestampMs))} · GPS ±${position.accuracy.toInt()} m",13,tint=com.sheshield.app.R.color.on_surface_secondary))}
            repo.prefs.getString("battery_error:${trip.tripId}",null)?.let{status.append("\nLatest heartbeat could not reach the server. Its previous watch may remain active.")}
        }
        body.addView(Ui.space(c,14));body.addView(Ui.text(c,"Only configured recipients can receive cloud SMS. Reconnecting cancels queued texts; sent messages cannot be recalled.",13,tint=com.sheshield.app.R.color.on_surface_secondary))
        val dialog=Ui.dialog(c).setTitle("Low battery protection").setView(Ui.scroll(c,body)).setPositiveButton("Done",null).setNeutralButton("Try demo",null).create()
        dialog.setOnShowListener{dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_NEUTRAL).setOnClickListener{dialog.dismiss();scope.launch{try{demo(c,repo,scope)}catch(e:CancellationException){throw e}catch(e:Exception){Ui.error(c,NetworkClient.message(e))}}}}
        dialog.show()
    }
    suspend fun demo(c:Context,repo:TripRepository,scope:CoroutineScope,recipient:TrustedContact?=null) {
        var state=repo.startBatteryDemo(recipient);val body=Ui.col(c,22)
        body.addView(Ui.text(c,"5% battery → no updates → Circle alert",19,true));body.addView(Ui.space(c,14))
        body.addView(Ui.text(c,if(recipient==null)"This uses a simulated battery and map position. The server runs a 20-second timer. No real SMS or calls are sent." else "The server will send one real SMS to ${recipient.name} after 20 seconds. It is clearly marked DEMO and uses a simulated location. No calls are placed.",14));body.addView(Ui.space(c,18))
        val progress=Ui.text(c,"Low battery and last position saved to the server.",16,true);body.addView(progress);body.addView(Ui.space(c,12))
        val preview=Ui.text(c,"",14);body.addView(preview)
        val dialog=Ui.dialog(c).setTitle("Battery protection demo").setView(Ui.scroll(c,body)).setPositiveButton("Close",null).create()
        var polling:Job?=null
        if(recipient==null)body.addView(Ui.button(c,"Send a real demo SMS",true){
            val circle=repo.contacts()
            if(circle.isEmpty()){Ui.error(c,"Add someone to your Circle to receive the demo SMS.");return@button}
            Ui.dialog(c).setTitle("Choose a demo recipient").setItems(circle.map{"${it.name} · •••• ${it.phone.takeLast(4)}"}.toTypedArray()){_,index->
                val person=circle[index]
                Ui.confirm(c,"Send demo SMS to ${person.name}?","This sends one real cloud SMS after a 20-second server timer. Its battery reading and location are simulated and the message says DEMO. Closing the demo cancels a message that has not been requested yet.","Start SMS demo"){
                    polling?.cancel()
                    scope.launch{try{repo.cancelBatteryDemo(state.id);dialog.dismiss();demo(c,repo,scope,person)}catch(e:CancellationException){throw e}catch(e:Exception){Ui.error(c,NetworkClient.message(e))}}
                }
            }.setNegativeButton("Cancel",null).show()
        })
        dialog.setOnDismissListener{polling?.cancel();scope.launch{runCatching{repo.cancelBatteryDemo(state.id)}}}
        dialog.show()
        polling=scope.launch{
            while(isActive&&dialog.isShowing){
                try{
                    state=repo.batteryDemoStatus(state.id)
                    if(state.state=="ALERTED"){
                        progress.text=if(recipient==null)"Server detected missing updates. Circle SMS simulated." else "Server detected missing updates. Demo SMS status:"
                        preview.text=state.messages.joinToString("\n"){"${it.contact.name}: ${it.status.lowercase().replace('_',' ')}"}+"\n\n"+(state.message?:"")
                        if(recipient==null||state.messages.all{it.status in listOf("DELIVERED","FAILED","UNDELIVERED","UNAVAILABLE","CANCELLED","REQUEST_UNKNOWN")})break
                    }else{
                        val seconds=((state.deadlineMs-(state.serverNowMs.takeIf{it>0}?:System.currentTimeMillis())+999)/1000).coerceAtLeast(0)
                        progress.text="Phone updates paused · server alert in ${seconds}s"
                    }
                }catch(e:CancellationException){throw e}catch(e:Exception){progress.text="Connection interrupted. The registered demo timer continues on the server."}
                delay(1000)
            }
        }
    }
}
