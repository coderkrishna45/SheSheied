package com.sheshield.app

import com.sheshield.app.data.model.*
import com.sheshield.app.util.DepartureDetector
import org.junit.Assert.*
import org.junit.Test

class DepartureDetectorTest {
    private val route=RouteOption("walk","walk",900,1112.0,"UNKNOWN",0.0,"",0,listOf(listOf(88.43,22.57),listOf(88.43,22.58)))
    private val origin=LatLng(22.57,88.43)
    private val destination=LatLng(22.58,88.43)
    private val now=1700000000000L
    private fun fix(i:Int)=LocationFix(22.574+i*.00001,88.431,5f,now+i*5000,now+i*5000)
    @Test fun departureNeedsSustainedAccurateFixesAndSurvivesSavedState(){
        var state=DepartureDetector.State()
        for(i in 0..8){val r=DepartureDetector.update(state,fix(i),route,origin,destination,now+i*5000);assertFalse(r.confirmed);state=r.state}
        val saved=com.google.gson.Gson().fromJson(com.google.gson.Gson().toJson(state),DepartureDetector.State::class.java)
        assertTrue(DepartureDetector.update(saved,fix(9),route,origin,destination,now+45000).confirmed)
        assertFalse(DepartureDetector.update(saved,fix(9),route.copy(revision=2),origin,destination,now+45000).confirmed)
    }
    @Test fun jumpsUncertainFixesEndpointsAndReturnsDoNotConfirmDeparture(){
        var state=DepartureDetector.State()
        for(i in 0..8)state=DepartureDetector.update(state,fix(i),route,origin,destination,now+i*5000).state
        for(f in listOf(fix(9).copy(accuracy=80f),fix(9).copy(longitude=88.45),fix(9).copy(longitude=88.43),fix(9).copy(latitude=22.5701,longitude=88.4301),fix(9).copy(timestampMs=now+100000))){assertFalse(DepartureDetector.update(state,f,route,origin,destination,maxOf(now+45000,f.timestampMs)).confirmed)}
        assertEquals(state,DepartureDetector.update(state,fix(1),route,origin,destination,now+45000).state)
    }
}
