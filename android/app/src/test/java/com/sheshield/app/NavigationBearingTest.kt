package com.sheshield.app
import com.sheshield.app.data.model.*
import com.sheshield.app.util.TripMath
import org.junit.Assert.*
import org.junit.Test
class NavigationBearingTest {
    private val north=RouteOption("walk","walk",900,1112.0,"UNKNOWN",0.0,"",0,listOf(listOf(88.43,22.57),listOf(88.43,22.58)))
    private fun fix()=LocationFix(22.574,88.43,5f,System.currentTimeMillis())
    @Test fun followsForwardRouteHeadingAndIgnoresDuplicateVertices(){
        assertEquals(0.0,TripMath.navigationBearing(north,fix())!!,.01)
        assertEquals(180.0,TripMath.navigationBearing(north.copy(geometry=north.geometry.reversed()),fix())!!,.01)
        val east=north.copy(geometry=listOf(listOf(88.43,22.574),listOf(88.43,22.574),listOf(88.44,22.574)))
        assertEquals(90.0,TripMath.navigationBearing(east,fix())!!,.02)
    }
    @Test fun staleInaccurateOffRouteAndArrivalFixesNeverSpinTheMap(){
        assertNull(TripMath.navigationBearing(north,fix().copy(timestampMs=System.currentTimeMillis()-61000)))
        assertNull(TripMath.navigationBearing(north,fix().copy(accuracy=70f)))
        assertNull(TripMath.navigationBearing(north,fix().copy(longitude=88.44)))
        assertNull(TripMath.navigationBearing(north,fix().copy(latitude=22.58)))
        assertNull(TripMath.navigationBearing(north.copy(geometry=emptyList()),fix()))
    }
    @Test fun realMovementCanOrientAwayFromTheRouteWhileJitterAndJumpsStayUnknown(){
        val first=fix().copy(timestampMs=System.currentTimeMillis()-15000)
        assertEquals(90.0,TripMath.movementBearing(first,first.copy(longitude=88.4302,timestampMs=first.timestampMs+15000))!!,.02)
        assertNull(TripMath.movementBearing(first,first.copy(longitude=88.43001,timestampMs=first.timestampMs+15000)))
        assertNull(TripMath.movementBearing(first,first.copy(longitude=88.44,timestampMs=first.timestampMs+15000)))
        assertNull(TripMath.movementBearing(first,first.copy(longitude=88.4302,timestampMs=first.timestampMs+31000)))
    }
}
