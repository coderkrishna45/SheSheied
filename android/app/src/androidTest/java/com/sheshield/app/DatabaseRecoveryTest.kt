package com.sheshield.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.room.Room
import com.sheshield.app.data.model.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DatabaseRecoveryTest {
    @Test fun versionOneMigrationPreservesJourneyContactsAndDeadline()=runBlocking {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val name="migration-verification.db"
        context.deleteDatabase(name)
        context.openOrCreateDatabase(name,0,null).use{db->
            db.execSQL("CREATE TABLE active_trip (tripId TEXT NOT NULL PRIMARY KEY,sessionToken TEXT NOT NULL,originLat REAL NOT NULL,originLng REAL NOT NULL,destinationLat REAL NOT NULL,destinationLng REAL NOT NULL,destinationLabel TEXT NOT NULL,selectedRouteId TEXT NOT NULL,state TEXT NOT NULL,startedAtMs INTEGER NOT NULL,lastLatitude REAL NOT NULL,lastLongitude REAL NOT NULL,lastUpdateMs INTEGER NOT NULL,checkInDeadlineMs INTEGER NOT NULL,trustedContacts TEXT NOT NULL)")
            db.execSQL("INSERT INTO active_trip VALUES ('legacy','','22.56','88.35','22.54','88.34','Victoria Memorial','old-route','CHECK_IN_PENDING',1,22.56,88.35,2,987654321,'[]')")
            db.version=1
        }
        val db=Room.databaseBuilder(context,AppDatabase::class.java,name).addMigrations(AppDatabase.migration).build()
        try{val trip=db.tripDao().getActiveTrip()!!;assertEquals("legacy",trip.tripId);assertEquals(987654321L,trip.checkInDeadlineMs);assertEquals("[]",trip.trustedContacts);assertEquals(TripState.CHECK_IN_PENDING,trip.state);assertEquals("",trip.routeJson)
            db.tripDao().enqueue(OutboxEvent("pending","legacy","v1/trips/legacy/end","{}"));assertEquals(1,db.tripDao().queued().size)
        }finally{db.close()}
        val restored=Room.databaseBuilder(context,AppDatabase::class.java,name).addMigrations(AppDatabase.migration).build()
        try{assertEquals("pending",restored.tripDao().queued().single().id);assertEquals("legacy",restored.tripDao().getActiveTrip()!!.tripId)}finally{restored.close();context.deleteDatabase(name)}
    }
}
