package com.sheshield.app

import com.sheshield.app.util.awaitCurrentLocation
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class LocationTimeoutTest {
    @Test fun slowGpsProducesAnActionableErrorInsteadOfSilentCancellation()=runBlocking {
        try {
            awaitCurrentLocation<String>(25){awaitCancellation()}
            fail("Expected a GPS error")
        }catch(e:IllegalStateException){assertTrue(e.message!!.contains("GPS"))}
    }
    @Test fun unavailableGpsProducesAnActionableError()=runBlocking {
        try {
            awaitCurrentLocation<String>{null}
            fail("Expected a GPS error")
        }catch(e:IllegalStateException){assertTrue(e.message!!.contains("try again"))}
    }
    @Test fun leavingTheScreenStillCancelsTheRequest()=runBlocking {
        try {
            withTimeout(25){awaitCurrentLocation<String>(10000){awaitCancellation()}}
            fail("Expected screen cancellation")
        }catch(e:TimeoutCancellationException){ /* The screen action must not show an error after leaving. */ }
    }
    @Test fun availableLocationIsReturned()=runBlocking {
        assertEquals("fresh",awaitCurrentLocation{"fresh"})
    }
}
