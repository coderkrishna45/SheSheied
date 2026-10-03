package com.sheshield.app.data.model

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.PrimaryKey
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.annotations.SerializedName

enum class TripState { IDLE, PLANNING, ACTIVE, CHECK_IN_PENDING, SOS_ACTIVE, COMPLETED, CANCELLED }
enum class RiskLevel { LOW, MEDIUM, HIGH, UNKNOWN }
data class LatLng(val latitude: Double, val longitude: Double)
data class Place(val label: String, val latitude: Double, val longitude: Double, val id: String = "")
data class TrustedContact(val name: String, val phone: String)
data class RiskSegment(@SerializedName("segment_id") val id: String, @SerializedName("start_index") val startIndex: Int,
    @SerializedName("end_index") val endIndex: Int, val score: Double, @SerializedName("risk_level") val level: String,
    @SerializedName("distance_meters") val distanceMeters: Double, @SerializedName("evidence_count") val evidenceCount: Int = 0,
    @SerializedName("observation_conflict") val observationConflict: Boolean = false)
data class Evidence(val id: String, val category: String, @SerializedName("days_old") val daysOld: Int,
    @SerializedName("distance_km") val distanceKm: Double, val source: String,
    @SerializedName("source_url") val sourceUrl: String? = null,
    @SerializedName("precision_meters") val precisionMeters: Int = 0,
    @SerializedName("distance_min_meters") val distanceMinMeters: Int = 0,
    @SerializedName("distance_max_meters") val distanceMaxMeters: Int = 0,
    @SerializedName("reviewed_at") val reviewedAt: String? = null,
    val occurred: EvidenceDate? = null, val historical: Boolean = false,
    @SerializedName("location_kind") val locationKind: String? = null,
    @SerializedName("location_label") val locationLabel: String? = null,
    @SerializedName("location_reason") val locationReason: String? = null,
    @SerializedName("report_status") val reportStatus: String? = null,
    @SerializedName("exclusion_reason") val exclusionReason: String? = null,
    val summary: String? = null, val setting: String? = null, val relation: String? = null,
    @SerializedName("review_count") val reviewCount: Int = 0,
    @SerializedName("source_review_count") val sourceReviewCount: Int = 0,
    val references: List<EvidenceReference>? = null)
data class EvidenceDate(val start: String, val end: String, val precision: String, val label: String?)
data class EvidenceReference(val source: String, val url: String)
data class RouteDecision(val basis: String, val summary: String, val reasons: List<DecisionReason>?)
data class DecisionReason(val kind: String, val text: String)
data class StreetObservation(val id: String, val kind: String, val source: String,
    @SerializedName("source_url") val sourceUrl: String,
    @SerializedName("observed_at") val observedAt: String,
    @SerializedName("expires_at") val expiresAt: String,
    @SerializedName("time_of_day") val timeOfDay: String,
    @SerializedName("location_label") val locationLabel: String?)
data class EvidenceStretch(val kind: String, val coverage: String,
    @SerializedName("from_meters") val fromMeters: Int, @SerializedName("to_meters") val toMeters: Int,
    @SerializedName("report_count") val reportCount: Int)
data class CoverageWindow(val source: String, val from: String, val to: String,
    @SerializedName("updated_at") val updatedAt: String)
data class EvidencePassport(@SerializedName("coverage_percent") val coveragePercent: Int,
    @SerializedName("longest_unknown_meters") val longestUnknownMeters: Int,
    @SerializedName("peak_exposure") val peakExposure: Double,
    @SerializedName("context_report_count") val contextReportCount: Int,
    @SerializedName("precise_report_count") val preciseReportCount: Int,
    val stretches: List<EvidenceStretch> = emptyList(),
    @SerializedName("coverage_windows") val coverageWindows: List<CoverageWindow> = emptyList(),
    @SerializedName("analysis_step_meters") val analysisStepMeters: Int = 50,
    @SerializedName("observation_coverage_percent") val observationCoveragePercent: Int = 0,
    @SerializedName("dataset_version") val datasetVersion: String? = null,
    @SerializedName("dataset_updated_at") val datasetUpdatedAt: String? = null,
    @SerializedName("dataset_collection") val datasetCollection: String? = null,
    val limitations: String? = null)
data class RouteStep(val instruction: String = "Continue along the route", val distance: Double = 0.0,
    @SerializedName("way_points") val wayPoints: List<Int> = emptyList())
data class RouteOption(@SerializedName("route_id") val routeId: String, val label: String,
    @SerializedName("duration_seconds") val durationSeconds: Int, @SerializedName("distance_meters") val distanceMeters: Double,
    @SerializedName("risk_level") val riskLevel: String, @SerializedName("risk_score") val riskScore: Double,
    @SerializedName("risk_summary") val riskSummary: String, @SerializedName("incident_count") val incidentCount: Int,
    val geometry: List<List<Double>>, @SerializedName("is_demo_data") val isDemoData: Boolean = false,
    val segments: List<RiskSegment> = emptyList(), val evidence: List<Evidence> = emptyList(),
    val coverage: String = "UNAVAILABLE", @SerializedName("extra_minutes") val extraMinutes: Int = 0,
    @SerializedName("evaluated_at") val evaluatedAt: String = "", @SerializedName("route_revision") val revision: Int = 1,
    val steps: List<RouteStep> = emptyList(),
    @SerializedName("origin_snap_meters") val originSnapMeters: Int = 0,
    @SerializedName("destination_snap_meters") val destinationSnapMeters: Int = 0,
    val passport: EvidencePassport? = null,
    @SerializedName("context_evidence") val contextEvidence: List<Evidence>? = null,
    @SerializedName("insight_context") val insightContext: List<Evidence>? = null,
    val observations: List<StreetObservation>? = null,
    val decision: RouteDecision? = null, val environment:WalkingEnvironment? = null,
    @SerializedName("context_selection") val contextSelection:ContextSelection? = null,
    @SerializedName("via_place") val viaPlace:ViaPlace? = null,
    @SerializedName("alternatives_status") val alternativesStatus:String? = null,
    @SerializedName("condition_preview") val conditionPreview:ConditionPreview? = null) {
    val points get() = geometry.map { LatLng(it[1], it[0]) }
    val preview get() = conditionPreview?.takeIf { !isDemoData && it.kind == "SYNTHETIC_WALKING_CONDITIONS" }
}
data class ConditionPreview(val kind:String,val version:String?,val disclosure:String?,val scope:String?,
    val level:String,val label:String,val score:Int?,@SerializedName("coverage_percent") val coveragePercent:Int,
    val summary:PreviewSummary?,val reasons:List<PreviewReason>?,val stretches:List<PreviewStretch>?,
    val recommended:Boolean=false,@SerializedName("comparison_available") val comparisonAvailable:Boolean=false,
    @SerializedName("recommendation_reason") val recommendationReason:String?,val limitations:String?)
data class PreviewSummary(@SerializedName("lower_exposure_meters") val lowerExposureMeters:Int=0,
    @SerializedName("mixed_meters") val mixedMeters:Int=0,@SerializedName("caution_meters") val cautionMeters:Int=0,
    @SerializedName("unknown_meters") val unknownMeters:Int=0)
data class PreviewReason(val level:String,val meters:Int,val conditions:List<String>)
data class PreviewStretch(val level:String,@SerializedName("distance_meters") val distanceMeters:Int,val geometry:List<List<Double>>)
data class WalkingSummary(@SerializedName("mapped_meters") val mappedMeters:Int=0,
    @SerializedName("lighting_known_meters") val lightingKnownMeters:Int=0,
    @SerializedName("mapped_lit_meters") val mappedLitMeters:Int=0,
    @SerializedName("mapped_unlit_meters") val mappedUnlitMeters:Int=0,
    @SerializedName("unknown_lighting_meters") val unknownLightingMeters:Int=0,
    @SerializedName("mapped_walkway_meters") val mappedWalkwayMeters:Int=0,
    @SerializedName("restricted_meters") val restrictedMeters:Int=0,
    @SerializedName("longest_facility_gap_meters") val longestFacilityGapMeters:Int=0)
data class WalkingStretch(@SerializedName("from_meters") val fromMeters:Int,
    @SerializedName("to_meters") val toMeters:Int,@SerializedName("start_index") val startIndex:Int,
    @SerializedName("end_index") val endIndex:Int,val lighting:String,val walkway:String,val restricted:Boolean,
    val phase:String,@SerializedName("source_url") val sourceUrl:String?,
    @SerializedName("map_updated_at") val mapUpdatedAt:String?,@SerializedName("arrival_at") val arrivalAt:String?)
data class ReportArea(val id:String,val name:String,val geometry:JsonObject,
    @SerializedName("event_ids") val eventIds:List<String>,val historical:Boolean,
    @SerializedName("source_url") val sourceUrl:String,@SerializedName("association_source_url") val associationSourceUrl:String,
    @SerializedName("location_reason") val locationReason:String,
    @SerializedName("intersection_meters") val intersectionMeters:Int)
data class MappedPlace(val id:String,val name:String,val point:List<Double>,val category:String,
    @SerializedName("source_url") val sourceUrl:String,@SerializedName("opening_hours") val openingHours:String?,
    @SerializedName("hours_status") val hoursStatus:String,@SerializedName("entrance_status") val entranceStatus:String,
    @SerializedName("straight_distance_meters") val straightDistanceMeters:Int,
    @SerializedName("distance_basis") val distanceBasis:String?=null,
    @SerializedName("walking_connection_meters") val walkingConnectionMeters:Int=0,
    @SerializedName("estimated_arrival_at") val estimatedArrivalAt:String?,
    @SerializedName("connection_status") val connectionStatus:String?)
data class PreferenceAvailability(val lighting:Boolean=false,@SerializedName("nearby_places") val nearbyPlaces:Boolean=false)
data class Surrounding(val id:String,val name:String,val kind:String,@SerializedName("source_url") val sourceUrl:String)
data class WalkingEnvironment(val version:String?,@SerializedName("collected_at") val collectedAt:String?,
    @SerializedName("evaluated_at") val evaluatedAt:String?,@SerializedName("valid_until") val validUntil:String?,
    val stale:Boolean,val summary:WalkingSummary,val stretches:List<WalkingStretch>?,
    @SerializedName("report_areas") val reportAreas:List<ReportArea>?,val facilities:List<MappedPlace>?,
    @SerializedName("nearby_places") val nearbyPlaces:List<MappedPlace>?,val surroundings:List<Surrounding>?,
    @SerializedName("help_places") val helpPlaces:List<MappedPlace>? = null,
    val activity:String?,val limitations:String?,val preference:String?,
    @SerializedName("preference_availability") val preferenceAvailability:PreferenceAvailability?)
data class ViaPlace(val id:String,val name:String,val point:List<Double>,@SerializedName("source_url") val sourceUrl:String)
data class NearbyPlacesResponse(val places:List<MappedPlace>,val notice:String,val stale:Boolean)
data class TripPlan(val id: String, val mode: String, val origin: Place, val destination: Place,
    val routes: List<RouteOption>, val attribution: String = "OpenStreetMap contributors",
    @SerializedName("geometry_source") val geometrySource: String = "",
    @SerializedName("expires_at_ms") val expiresAtMs: Long = 0, val preference:String?=null,
    @SerializedName("avoid_area_ids") val avoidAreaIds:List<String>?=null)
data class LocationFix(val latitude: Double, val longitude: Double,
    @SerializedName("accuracy_meters") val accuracy: Float = 0f, @SerializedName("timestamp_ms") val timestampMs: Long = System.currentTimeMillis(),
    val sequence: Long = 0)
data class CheckInEvent(val id: String, @SerializedName("segment_id") val segmentId: String,
    val status: String, @SerializedName("deadline_ms") val deadlineMs: Long,
    @SerializedName("delivery_ready") val deliveryReady: Boolean = false,
    @SerializedName("companion_seen_at_ms") val companionSeenAtMs: Long? = null, val kind:String? = null)
data class DepartureProtection(val enabled:Boolean=false,@SerializedName("window_seconds") val windowSeconds:Int=120)
data class RemoteTrip(val id: String, val mode: String, val state: String, val origin: Place, val destination: Place,
    val route: RouteOption, val contacts: List<TrustedContact> = emptyList(),
    @SerializedName("last_location") val lastLocation: LocationFix? = null,
    @SerializedName("check_in") val checkIn: CheckInEvent? = null, @SerializedName("sos_id") val sosId: String? = null,
    @SerializedName("started_at_ms") val startedAtMs: Long, @SerializedName("ended_at_ms") val endedAtMs: Long? = null,
    val version: Int = 0, @SerializedName("departure_protection") val departureProtection:DepartureProtection? = null,
    @SerializedName("departure_grace_until_ms") val departureGraceUntilMs:Long=0)
@Entity(tableName = "active_trip")
data class ActiveTrip(@PrimaryKey val tripId: String, val sessionToken: String = "", val originLat: Double,
    val originLng: Double, val destinationLat: Double, val destinationLng: Double, val destinationLabel: String,
    val selectedRouteId: String, val state: TripState = TripState.ACTIVE,
    val startedAtMs: Long = System.currentTimeMillis(), val lastLatitude: Double = originLat,
    val lastLongitude: Double = originLng, val lastUpdateMs: Long = 0, val checkInDeadlineMs: Long = 0,
    val trustedContacts: String = "[]", @ColumnInfo(defaultValue="''") val routeJson: String = "",
    @ColumnInfo(defaultValue="'LIVE'") val mode: String = "LIVE",
    @ColumnInfo(defaultValue="''") val checkInId: String = "", @ColumnInfo(defaultValue="'SYNCED'") val syncStatus: String = "SYNCED",
    @ColumnInfo(defaultValue="0") val accuracyMeters: Float = 0f,
    @ColumnInfo(defaultValue="''") val sosId: String = "", @ColumnInfo(defaultValue="0") val endedAtMs: Long = 0,
    @ColumnInfo(defaultValue="0") val version: Int = 0, @ColumnInfo(defaultValue="0") val progressIndex: Int = 0,
    @ColumnInfo(defaultValue="0") val lastCheckInAtMs: Long = 0) {
    fun route(): RouteOption? = runCatching { Gson().fromJson(routeJson, RouteOption::class.java) }.getOrNull()
    val isRehearsal get() = mode == "REHEARSAL"
    val isEnded get() = state == TripState.COMPLETED || state == TripState.CANCELLED
}
@Entity(tableName = "trip_plans")
data class SavedPlan(@PrimaryKey val id: String = "current", val json: String)
@Entity(tableName = "outbox")
data class OutboxEvent(@PrimaryKey val id: String, val tripId: String, val path: String, val payload: String,
    val createdAtMs: Long = System.currentTimeMillis(), val expiresAtMs: Long = 0)
@Entity(tableName = "sos_incidents")
data class SavedIncident(@PrimaryKey val id: String, val json: String)
data class TimelineEvent(val id: String, val status: String, val message: String, val contact: String? = null,
    @SerializedName("at_ms") val atMs: Long)
data class DeliveryAttempt(val id: String, val contact: TrustedContact, val status: String,
    @SerializedName("unavailable_reason") val unavailableReason:String? = null)
data class DeliveryContact(val contact:TrustedContact,@SerializedName("voice_configured") val voiceConfigured:Boolean,
    @SerializedName("sms_configured") val smsConfigured:Boolean,@SerializedName("voice_reason") val voiceReason:String?,@SerializedName("sms_reason") val smsReason:String?)
data class DeliveryCheck(val contacts:List<DeliveryContact>,val notice:String)
data class CompanionMessage(val id:String,val contact:TrustedContact,val status:String)
data class BatteryPosition(val latitude:Double,val longitude:Double,val accuracy:Float,
    @SerializedName("timestamp_ms") val timestampMs:Long,val address:String?=null)
data class BatteryMessage(val id:String?=null,val contact:TrustedContact,val status:String,val message:String?=null)
data class BatteryWatch(val state:String,val percent:Int=0,
    @SerializedName("deadline_ms") val deadlineMs:Long?=null,
    @SerializedName("last_seen_at_ms") val lastSeenAtMs:Long=0,
    val location:BatteryPosition?=null,
    @SerializedName("sms_attempts") val messages:List<BatteryMessage> = emptyList())
data class BatteryDemo(val id:String,val state:String,
    @SerializedName("deadline_ms") val deadlineMs:Long,val message:String?=null,
    @SerializedName("server_now_ms") val serverNowMs:Long=0,
    @SerializedName("sms_attempts") val messages:List<BatteryMessage> = emptyList())
data class ContextSelection(val basis:String,@SerializedName("radius_meters") val radiusMeters:Int?,val notice:String)
data class SosIncident(val id: String, @SerializedName("trip_id") val tripId: String? = null,
    val mode: String, val status: String, val cancelled: Boolean = false, val location: LocationFix? = null,
    val contacts: List<TrustedContact> = emptyList(), val timeline: List<TimelineEvent> = emptyList(),
    val attempts: List<DeliveryAttempt> = emptyList(), @SerializedName("sms_attempts") val smsAttempts: List<DeliveryAttempt>? = null,
    @SerializedName("created_at_ms") val createdAtMs: Long)
data class SessionResponse(@SerializedName("session_token") val token: String)
data class PlacesResponse(val places: List<Place>)
data class TripsResponse(val trips: List<RemoteTrip>)
data class ReadyResponse(val status: String, val routing: Boolean, @SerializedName("risk_data") val riskData: Boolean,
    val n8n: Boolean, val callbacks: Boolean, @SerializedName("live_alerts") val liveAlerts: Boolean,
    @SerializedName("cloud_sms") val cloudSms: Boolean = false,
    @SerializedName("evidence_context") val evidenceContext: Int = 0,
    @SerializedName("street_reports") val streetReports: Int = 0)
data class ShareResponse(val url: String)
data class AvoidArea(val center: List<Double>, @SerializedName("radius_meters") val radiusMeters: Int)
data class RerouteProposal(@SerializedName("trip_id") val tripId: String,
    @SerializedName("proposal_id") val proposalId: String, val routes: List<RouteOption>,
    val origin: LocationFix, @SerializedName("avoid_areas") val avoidAreas: List<AvoidArea> = emptyList(),
    @SerializedName("expires_at_ms") val expiresAtMs: Long)
