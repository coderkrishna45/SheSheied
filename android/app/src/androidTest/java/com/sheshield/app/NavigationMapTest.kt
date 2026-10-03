package com.sheshield.app

import android.view.ViewGroup
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sheshield.app.ui.MainActivity
import com.sheshield.app.ui.components.RouteMapRenderer
import com.sheshield.app.data.model.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Exercise the native camera with a synthetic position. No journeys or alerts. */
@RunWith(AndroidJUnit4::class)
class NavigationMapTest {
    @Test fun navigationStartsFollowingWithRouteBearingAndTilt(){
        val ready=CountDownLatch(1)
        var failure:Throwable?=null
        var renderer:RouteMapRenderer?=null
        ActivityScenario.launch(MainActivity::class.java).use{scenario->
            scenario.onActivity{activity->
                val map=RouteMapRenderer(activity);renderer=map
                val route=RouteOption("walk","walk",600,500.0,"UNKNOWN",0.0,"",0,listOf(listOf(88.35,22.56),listOf(88.355,22.56)))
                map.navigation();map.routes(listOf(route),route.routeId,false)
                map.location(LocationFix(22.56,88.35,5f,System.currentTimeMillis()))
                map.onReady={map.view.getMapAsync{native->
                    try{
                        val camera=native.cameraPosition
                        assertEquals(16.6,camera.zoom,.01)
                        assertEquals(90.0,camera.bearing,.1)
                        assertEquals(30.0,camera.tilt,.1)
                        assertEquals(22.56,camera.target!!.latitude,.00001)
                        assertEquals(88.35,camera.target!!.longitude,.00001)
                    }catch(e:Throwable){failure=e}finally{ready.countDown()}
                }}
                (activity.window.decorView as ViewGroup).addView(map.view,ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT))
                map.view.onStart();map.view.onResume()
            }
            assertTrue("Native map style did not become ready",ready.await(20,TimeUnit.SECONDS))
            failure?.let{throw it}
            scenario.onActivity{renderer?.let{map->map.view.onPause();map.view.onStop();(map.view.parent as? ViewGroup)?.removeView(map.view);map.destroy()}}
        }
    }
}
