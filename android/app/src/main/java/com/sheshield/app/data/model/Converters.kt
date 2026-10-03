package com.sheshield.app.data.model

import androidx.room.TypeConverter

class Converters {
    @TypeConverter fun fromTripState(v: TripState): String = v.name
    @TypeConverter fun toTripState(v: String): TripState =
        runCatching { TripState.valueOf(v) }.getOrDefault(TripState.IDLE)
}
