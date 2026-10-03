package com.sheshield.app

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.sheshield.app.data.model.RouteOption
import com.sheshield.app.ui.components.ConditionPreviewUi
import org.junit.Assert.*
import org.junit.Test

class ConditionPreviewCompatibilityTest {
    private val base="""{"route_id":"live","label":"Fastest walk","duration_seconds":600,"distance_meters":700,"risk_level":"UNKNOWN","risk_score":0,"risk_summary":"Unknown","incident_count":0,"geometry":[[88.431,22.572],[88.431,22.578]],"is_demo_data":false,"segments":[],"evidence":[]}"""
    private val preview="""{"kind":"SYNTHETIC_WALKING_CONDITIONS","level":"HIGH","label":"More exposed","coverage_percent":95,"recommended":false,"summary":{"caution_meters":620,"unknown_meters":30},"stretches":[{"level":"HIGH","distance_meters":620,"geometry":[[88.431,22.572],[88.431,22.578]]}],"reasons":[],"limitations":"Synthetic conditions"}"""
    @Test fun legacyRoutesRemainUnknownWithNoPreview() {
        val r=Gson().fromJson(base,RouteOption::class.java);assertNull(r.preview);assertEquals("UNKNOWN",r.riskLevel)
    }
    @Test fun previewSurvivesTripStorageWithoutChangingModeOrCrimeEvidence() {
        val json=JsonParser.parseString(base).asJsonObject;json.add("condition_preview",JsonParser.parseString(preview))
        val gson=Gson();val r=gson.fromJson(gson.toJson(gson.fromJson(json,RouteOption::class.java)),RouteOption::class.java)
        assertNotNull(r.preview);assertFalse(r.isDemoData);assertEquals("UNKNOWN",r.riskLevel);assertTrue(r.evidence.isEmpty());assertTrue(r.segments.isEmpty())
        assertEquals(620,r.preview!!.summary!!.cautionMeters);assertEquals(2,r.preview!!.stretches!!.first().geometry.size)
        assertTrue(ConditionPreviewUi.detail(r.preview!!).contains("620 m"))
    }
    @Test fun unrecognisedProvenanceAndRecordedRehearsalCannotActivateTheLivePreview() {
        val json=JsonParser.parseString(base).asJsonObject;val p=JsonParser.parseString(preview).asJsonObject;p.addProperty("kind","VERIFIED")
        json.add("condition_preview",p);assertNull(Gson().fromJson(json,RouteOption::class.java).preview)
        p.addProperty("kind","SYNTHETIC_WALKING_CONDITIONS");json.addProperty("is_demo_data",true)
        assertNull(Gson().fromJson(json,RouteOption::class.java).preview)
    }
}
