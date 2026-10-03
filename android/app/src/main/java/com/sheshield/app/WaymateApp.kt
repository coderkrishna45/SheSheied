package com.sheshield.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.sheshield.app.util.NotificationHelper

/**
 * Application entry point.
 * Initialises notification channels on startup.
 */
class WaymateApp : Application() {

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createChannels(this)
    }
}
