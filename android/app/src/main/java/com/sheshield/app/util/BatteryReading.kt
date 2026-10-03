package com.sheshield.app.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

data class BatteryReading(val percent:Int,val charging:Boolean,val observedAtMs:Long=System.currentTimeMillis()) {
    companion object {
        fun current(context:Context):BatteryReading? {
            val intent=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED))?:return null
            val level=intent.getIntExtra(BatteryManager.EXTRA_LEVEL,-1)
            val scale=intent.getIntExtra(BatteryManager.EXTRA_SCALE,-1)
            if(level<0||scale<=0)return null
            val status=intent.getIntExtra(BatteryManager.EXTRA_STATUS,-1)
            return BatteryReading((level*100/scale).coerceIn(0,100),intent.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)!=0||status==BatteryManager.BATTERY_STATUS_CHARGING||status==BatteryManager.BATTERY_STATUS_FULL)
        }
    }
}
