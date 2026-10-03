package com.sheshield.app.data.model

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TripDao {
    @Query("SELECT * FROM active_trip WHERE state NOT IN ('COMPLETED','CANCELLED') ORDER BY startedAtMs DESC LIMIT 1")
    fun observeActiveTrip(): Flow<ActiveTrip?>
    @Query("SELECT * FROM active_trip WHERE state NOT IN ('COMPLETED','CANCELLED') ORDER BY startedAtMs DESC LIMIT 1")
    suspend fun getActiveTrip(): ActiveTrip?
    @Query("SELECT * FROM active_trip ORDER BY startedAtMs DESC") fun observeHistory(): Flow<List<ActiveTrip>>
    @Query("SELECT * FROM active_trip WHERE tripId=:id") suspend fun getTripById(id: String): ActiveTrip?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(trip: ActiveTrip)
    @Query("DELETE FROM active_trip WHERE tripId=:id AND state IN ('COMPLETED','CANCELLED')") suspend fun delete(id: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun savePlan(plan: SavedPlan)
    @Query("SELECT * FROM trip_plans WHERE id='current'") suspend fun getPlan(): SavedPlan?
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun enqueue(event: OutboxEvent)
    @Query("SELECT * FROM outbox ORDER BY createdAtMs ASC") suspend fun queued(): List<OutboxEvent>
    @Query("DELETE FROM outbox WHERE id=:id") suspend fun acknowledge(id: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun saveIncident(incident: SavedIncident)
    @Query("SELECT * FROM sos_incidents WHERE id=:id") suspend fun getIncident(id: String): SavedIncident?
}
