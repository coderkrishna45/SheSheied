package com.sheshield.app

import com.google.gson.Gson
import com.sheshield.app.data.model.RouteOption
import org.junit.Assert.*
import org.junit.Test

class EvidenceCompatibilityTest {
    private val saved="""{"route_id":"old","label":"Walking route","duration_seconds":300,"distance_meters":400,"risk_level":"UNKNOWN","risk_score":0,"risk_summary":"Unknown","incident_count":0,"geometry":[[88.43,22.57],[88.43,22.58]],"segments":[],"evidence":[],"passport":{"coverage_percent":0,"longest_unknown_meters":400,"peak_exposure":0,"context_report_count":0,"precise_report_count":0,"stretches":[]}}"""
    @Test fun savedRoutesRemainReadableWithoutNewEvidenceFields() {
        val route=Gson().fromJson(saved,RouteOption::class.java)
        assertEquals("old",route.routeId)
        assertNull(route.decision)
        assertEquals("",route.evaluatedAt.orEmpty())
        assertTrue(route.contextEvidence.orEmpty().isEmpty())
        assertTrue(route.observations.orEmpty().isEmpty())
        assertNull(route.passport?.datasetVersion)
        assertEquals(400,route.passport?.longestUnknownMeters)
    }
    @Test fun datePrecisionAndContextRemainSeparateAfterSavingAndReopening() {
        val json=com.google.gson.JsonParser.parseString(saved).asJsonObject
        json.add("context_evidence",com.google.gson.JsonParser.parseString("""[{"id":"source","category":"assault","days_old":3,"distance_km":0,"source":"Publisher","relation":"AREA_CONTEXT","location_kind":"named_area","location_label":"Sector V","occurred":{"start":"2026-09-29T18:30:00.000Z","end":"2026-09-30T18:29:59.999Z","precision":"day","label":"30 September · India"},"references":[{"source":"Publisher","url":"https://example.org/source"}]}]"""))
        json.add("decision",com.google.gson.JsonParser.parseString("""{"basis":"WALKING_TIME","summary":"Walking time; safety unknown","reasons":[{"kind":"GAPS","text":"Coverage unknown"}]}"""))
        json.getAsJsonObject("passport").addProperty("dataset_version","test-only")
        val gson=Gson();val route=gson.fromJson(gson.toJson(gson.fromJson(json,RouteOption::class.java)),RouteOption::class.java)
        assertEquals(0,route.incidentCount)
        assertTrue(route.evidence.isEmpty())
        assertEquals("day",route.contextEvidence!!.single().occurred!!.precision)
        assertEquals("AREA_CONTEXT",route.contextEvidence!!.single().relation)
        assertEquals("https://example.org/source",route.contextEvidence!!.single().references!!.single().url)
        assertEquals("WALKING_TIME",route.decision!!.basis)
        assertEquals("test-only",route.passport!!.datasetVersion)
    }
}
