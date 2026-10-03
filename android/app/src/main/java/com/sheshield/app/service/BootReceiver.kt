package com.sheshield.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.sheshield.app.data.repository.TripRepository
import com.sheshield.app.util.NotificationHelper
import kotlinx.coroutines.*

class BootReceiver:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
        if(intent.action!=Intent.ACTION_BOOT_COMPLETED)return
        val pending=goAsync()
        CoroutineScope(Dispatchers.IO).launch{try{if(TripRepository.get(context).active()!=null)NotificationHelper.resume(context)}finally{pending.finish()}}
    }
}
