package com.sheshield.app.util

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.*
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.sheshield.app.data.model.LocationFix

object SmsHelper {
    private fun key(incident:String,phone:String)="sms:$incident:$phone"
    fun statuses(context:Context,incident:String,phones:List<String>):List<String>{
        val prefs=context.getSharedPreferences("sms_status",Context.MODE_PRIVATE)
        val source=context.getSharedPreferences("sheshield_prefs",Context.MODE_PRIVATE).getString("sms_incident:$incident",incident)?:incident
        return phones.map { phone -> "$phone · ${prefs.getString(key(source,phone),"Not requested")}" }
    }
    fun sendSosMessages(context:Context,phones:List<String>,location:LocationFix?,incident:String){
        val prefs=context.getSharedPreferences("sms_status",Context.MODE_PRIVATE)
        if(ContextCompat.checkSelfPermission(context,Manifest.permission.SEND_SMS)!=PackageManager.PERMISSION_GRANTED){phones.forEach{prefs.edit().putString(key(incident,it),"Permission unavailable").apply()};return}
        val manager=context.getSystemService(SmsManager::class.java)?:return
        val message="Waymate SOS: I may need help. "+if(location!=null)"Last recorded location: https://maps.google.com/?q=${location.latitude},${location.longitude} at ${java.util.Date(location.timestampMs)}" else "My location is unavailable. Please contact me."
        for(phone in phones){
            val source=context.getSharedPreferences("sheshield_prefs",Context.MODE_PRIVATE).getString("sms_incident:$incident",incident)?:incident
            val statusKey=key(source,phone);if(prefs.contains(statusKey))continue
            try{
                val parts=manager.divideMessage(message)
                fun callbacks(delivery:Boolean)=ArrayList(parts.indices.map{index->
                    PendingIntent.getBroadcast(context,(statusKey+index+delivery).hashCode(),Intent(context,SmsStatusReceiver::class.java)
                        .setAction(if(delivery)"DELIVERED" else "SENT").putExtra("key",statusKey).putExtra("part",index).putExtra("count",parts.size),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                })
                prefs.edit().putString(statusKey,"Requesting").apply()
                manager.sendMultipartTextMessage(phone,null,parts,callbacks(false),callbacks(true))
            }catch(e:Exception){prefs.edit().putString(statusKey,"Send failed").apply()}
        }
    }
}
class SmsStatusReceiver:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
        val key=intent.getStringExtra("key")?:return
        val prefs=context.getSharedPreferences("sms_status",Context.MODE_PRIVATE)
        if(resultCode!=Activity.RESULT_OK){prefs.edit().putString(key,"Send failed").apply();return}
        val suffix=if(intent.action=="DELIVERED")"delivery" else "sent"
        val part=intent.getIntExtra("part",0);val count=intent.getIntExtra("count",1)
        prefs.edit().putBoolean("$key:$suffix:$part",true).apply()
        if((0 until count).all{prefs.getBoolean("$key:$suffix:$it",false)})prefs.edit().putString(key,if(suffix=="delivery")"Delivered" else "Sent · delivery unconfirmed").apply()
    }
}
