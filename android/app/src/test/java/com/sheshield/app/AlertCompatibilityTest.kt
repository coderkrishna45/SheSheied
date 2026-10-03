package com.sheshield.app

import com.google.gson.Gson
import com.sheshield.app.data.model.SosIncident
import org.junit.Assert.*
import org.junit.Test

class AlertCompatibilityTest {
    @Test fun savedAlertsFromTheCallOnlyVersionKeepTheirContactsWithoutSmsRecords() {
        val incident=Gson().fromJson("""{
            "id":"saved-alert","mode":"LIVE","status":"UNAVAILABLE",
            "contacts":[{"name":"Friend","phone":"+919999999999"}],
            "timeline":[],"attempts":[],"created_at_ms":1
        }""",SosIncident::class.java)
        assertEquals("Friend",incident.contacts.single().name)
        assertEquals("saved-alert",incident.id)
        assertTrue(incident.smsAttempts.orEmpty().isEmpty())
    }
}
