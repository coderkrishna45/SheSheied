package com.sheshield.app.data.model

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities=[ActiveTrip::class,SavedPlan::class,OutboxEvent::class,SavedIncident::class],version=2,exportSchema=true)
@TypeConverters(Converters::class)
abstract class AppDatabase: RoomDatabase() {
    abstract fun tripDao(): TripDao
    companion object {
        @Volatile private var instance: AppDatabase? = null
        val migration = object: Migration(1,2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                listOf("routeJson TEXT NOT NULL DEFAULT ''", "mode TEXT NOT NULL DEFAULT 'LIVE'",
                    "checkInId TEXT NOT NULL DEFAULT ''", "syncStatus TEXT NOT NULL DEFAULT 'SYNCED'",
                    "accuracyMeters REAL NOT NULL DEFAULT 0", "sosId TEXT NOT NULL DEFAULT ''",
                    "endedAtMs INTEGER NOT NULL DEFAULT 0", "version INTEGER NOT NULL DEFAULT 0",
                    "progressIndex INTEGER NOT NULL DEFAULT 0", "lastCheckInAtMs INTEGER NOT NULL DEFAULT 0")
                    .forEach { db.execSQL("ALTER TABLE active_trip ADD COLUMN $it") }
                db.execSQL("CREATE TABLE IF NOT EXISTS trip_plans (id TEXT NOT NULL PRIMARY KEY,json TEXT NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS outbox (id TEXT NOT NULL PRIMARY KEY,tripId TEXT NOT NULL,path TEXT NOT NULL,payload TEXT NOT NULL,createdAtMs INTEGER NOT NULL,expiresAtMs INTEGER NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS sos_incidents (id TEXT NOT NULL PRIMARY KEY,json TEXT NOT NULL)")
            }
        }
        fun get(ctx: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(ctx.applicationContext,AppDatabase::class.java,"sheshield.db")
                .addMigrations(migration).build().also { instance=it }
        }
    }
}
