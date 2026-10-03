package com.sheshield.app

import com.sheshield.app.data.model.*
import com.sheshield.app.util.TripMath
import org.junit.Assert.*
import org.junit.Test

class RiskEngineTest {
    private fun route(points:List<List<Double>>)=RouteOption("r","Walk",1200,2000.0,"UNKNOWN",0.0,"",0,points)
    @Test fun midpointProjectsOntoSegment(){val p=TripMath.project(LatLng(0.0,0.01),route(listOf(listOf(0.0,0.0),listOf(0.02,0.0))));assertEquals(0.0,p.distanceMeters,0.001);assertEquals(0.5,p.fraction,0.001);assertEquals(1112.0,p.remainingMeters,5.0)}
    @Test fun distanceIsZeroForIdenticalCoordinates(){assertEquals(0.0,TripMath.distance(LatLng(22.56,88.35),LatLng(22.56,88.35)),0.0)}
    @Test fun offRouteDistanceIsMeasuredFromLine(){val p=TripMath.project(LatLng(0.001,0.01),route(listOf(listOf(0.0,0.0),listOf(0.02,0.0))));assertEquals(111.2,p.distanceMeters,1.0)}
    @Test fun remainingDistanceIncludesSubsequentSegments(){val p=TripMath.project(LatLng(0.0,0.005),route(listOf(listOf(0.0,0.0),listOf(0.01,0.0),listOf(0.02,0.0))));assertEquals(1668.0,p.remainingMeters,5.0)}
    @Test fun duplicatePointsDoNotBreakProjection(){assertTrue(TripMath.project(LatLng(0.0,0.0),route(listOf(listOf(0.0,0.0),listOf(0.0,0.0)))).distanceMeters.isFinite())}
    @Test fun staleAndInaccurateFixesAreRejected(){assertFalse(TripMath.validFix(LocationFix(22.5,88.3,5f,0),100000));assertFalse(TripMath.validFix(LocationFix(22.5,88.3,500f,100000),100000))}
    @Test fun finiteRangeCoordinatesAreRequired(){assertFalse(TripMath.validFix(LocationFix(Double.NaN,88.0,5f,100000),100000));assertFalse(TripMath.validFix(LocationFix(91.0,88.0,5f,100000),100000))}
    @Test fun currentAccurateFixIsValid(){assertTrue(TripMath.validFix(LocationFix(22.5,88.3,5f,100000),100000))}
}
