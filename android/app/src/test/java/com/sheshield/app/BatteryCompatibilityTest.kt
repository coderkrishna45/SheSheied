package com.sheshield.app

import com.google.gson.Gson
import com.sheshield.app.data.model.*
import org.junit.Assert.*
import org.junit.Test

class BatteryCompatibilityTest {
    @Test fun batteryAcknowledgementPreservesLocationAndPerRecipientDelivery() {
        val watch=Gson().fromJson("""{"state":"ALERTED","percent":5,"deadline_ms":null,"last_seen_at_ms":1000,"location":{"latitude":22.558,"longitude":88.351,"accuracy":12,"timestamp_ms":900,"address":"Indian Museum, Kolkata"},"sms_attempts":[{"id":"sms-1","contact":{"name":"Companion","phone":"+919999999999"},"status":"DELIVERED"}]}""",BatteryWatch::class.java)
        assertNull(watch.deadlineMs);assertEquals(1000L,watch.lastSeenAtMs);assertEquals("Indian Museum, Kolkata",watch.location?.address);assertEquals(900L,watch.location?.timestampMs);assertEquals("DELIVERED",watch.messages.single().status)
    }
    @Test fun demonstrationUsesServerTimeAndDoesNotMislabelSimulatedMessagesAsDelivered() {
        val demo=Gson().fromJson("""{"id":"demo","state":"ALERTED","deadline_ms":21000,"server_now_ms":22000,"sms_attempts":[{"contact":{"name":"Companion","phone":"+919999999999"},"status":"SIMULATED"}],"message":"DEMO - no emergency"}""",BatteryDemo::class.java)
        assertEquals(22000L,demo.serverNowMs);assertEquals("SIMULATED",demo.messages.single().status);assertTrue(demo.message!!.startsWith("DEMO"))
        val body=Gson().toJsonTree(LocationFix(22.558,88.351,12f,900)).asJsonObject
        assertEquals(12f,body.get("accuracy_meters").asFloat);assertEquals(900L,body.get("timestamp_ms").asLong)
    }
}
