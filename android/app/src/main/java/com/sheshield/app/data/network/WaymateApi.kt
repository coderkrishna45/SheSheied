package com.sheshield.app.data.network

import com.google.gson.JsonObject
import com.sheshield.app.data.model.*
import retrofit2.http.*

interface WaymateApi {
    @GET("ready") suspend fun ready(): ReadyResponse
    @POST("v1/sessions") suspend fun enroll(@Body body: Map<String,String>): SessionResponse
    @GET("v1/places") suspend fun places(@Query("q") query: String): PlacesResponse
    @POST("v1/plans") suspend fun plan(@Body body: JsonObject): TripPlan
    @POST("v1/plans/{id}/compare") suspend fun compare(@Path("id") id:String,@Body body:JsonObject):TripPlan
    @POST("v1/trips/{id}/nearby") suspend fun nearby(@Path("id") id:String,@Body body:JsonObject):NearbyPlacesResponse
    @POST("v1/trips") suspend fun start(@Header("Idempotency-Key") key: String, @Body body: JsonObject): RemoteTrip
    @GET("v1/trips/{id}") suspend fun trip(@Path("id") id: String): RemoteTrip
    @POST("v1/trips/{id}/locations") suspend fun location(@Path("id") id: String, @Body fix: LocationFix): RemoteTrip
    @POST suspend fun command(@Url path: String,@Header("Idempotency-Key") key: String,@Body body: JsonObject): JsonObject
    @POST("v1/sos") suspend fun sos(@Header("Idempotency-Key") key: String,@Body body: JsonObject): SosIncident
    @GET("v1/sos/{id}") suspend fun incident(@Path("id") id: String): SosIncident
    @POST("v1/trips/{id}/reroute") suspend fun reroute(@Path("id") id: String,@Body body: JsonObject): RerouteProposal
    @POST("v1/trips/{id}/share") suspend fun share(@Path("id") id: String, @Body body: JsonObject = JsonObject()): ShareResponse
    @POST("v1/delivery/check") suspend fun deliveryCheck(@Body body:JsonObject):DeliveryCheck
    @POST("v1/trips/{id}/companion-sms") suspend fun companionSms(@Path("id") id:String,@Header("Idempotency-Key") key:String,@Body body:JsonObject):CompanionMessage
    @GET("v1/companion-sms/{id}") suspend fun companionMessage(@Path("id") id:String):CompanionMessage
    @DELETE("v1/trips/{id}/share") suspend fun revokeShares(@Path("id") id: String): JsonObject
    @DELETE("v1/trips/{id}") suspend fun deleteTrip(@Path("id") id: String): JsonObject
    @POST("v1/trips/{id}/battery") suspend fun batteryHeartbeat(@Path("id") id:String,@Body body:JsonObject):BatteryWatch
    @GET("v1/trips/{id}/battery") suspend fun batteryWatch(@Path("id") id:String):BatteryWatch
    @POST("v1/battery-demo") suspend fun batteryDemo(@Body body:JsonObject):BatteryDemo
    @GET("v1/battery-demo/{id}") suspend fun batteryDemoStatus(@Path("id") id:String):BatteryDemo
    @DELETE("v1/battery-demo/{id}") suspend fun cancelBatteryDemo(@Path("id") id:String):JsonObject
}
