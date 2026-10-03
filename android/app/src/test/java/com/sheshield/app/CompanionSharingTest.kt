package com.sheshield.app

import com.google.gson.JsonParser
import com.google.gson.JsonObject
import com.sheshield.app.data.network.WaymateApi
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class CompanionSharingTest {
    @Test fun selectedCompanionUsesCloudSmsWithOneRecipientAndPollsProviderStatus() = runBlocking {
        var requests=0
        val client=OkHttpClient.Builder().addInterceptor{chain->
            val request=chain.request();requests++
            val response=if(request.method=="POST"){
                assertEquals("/v1/trips/current-trip/companion-sms",request.url.encodedPath)
                assertEquals("send-once",request.header("Idempotency-Key"))
                val buffer=Buffer();request.body!!.writeTo(buffer);val body=JsonParser.parseString(buffer.readUtf8()).asJsonObject
                assertEquals(1,body.size());assertEquals("+919999999999",body.getAsJsonObject("contact").get("phone").asString)
                """{"id":"message","contact":{"name":"Chosen","phone":"+919999999999"},"status":"QUEUED"}"""
            }else{
                assertEquals("GET",request.method);assertEquals("/v1/companion-sms/message",request.url.encodedPath)
                """{"id":"message","contact":{"name":"Chosen","phone":"+919999999999"},"status":"DELIVERED"}"""
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(response.toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api=Retrofit.Builder().baseUrl("https://api.example/").client(client).addConverterFactory(GsonConverterFactory.create()).build().create(WaymateApi::class.java)
        val body=JsonObject().apply{add("contact",JsonParser.parseString("""{"name":"Chosen","phone":"+919999999999"}"""))}
        val message=api.companionSms("current-trip","send-once",body);assertEquals("QUEUED",message.status)
        assertEquals("DELIVERED",api.companionMessage(message.id).status);assertEquals(2,requests)
    }
    @Test fun companionLinkRequestIncludesJsonEvenWithoutInputFields() = runBlocking {
        var requests = 0
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            requests++
            assertEquals("POST", request.method)
            assertEquals("/v1/trips/current-trip/share", request.url.encodedPath)
            val body = requireNotNull(request.body)
            assertEquals("application/json", body.contentType()?.let { "${it.type}/${it.subtype}" })
            val buffer = Buffer()
            body.writeTo(buffer)
            assertEquals(0, JsonParser.parseString(buffer.readUtf8()).asJsonObject.size())
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200)
                .message("OK").body("""{"url":"https://api.example/share/private-token"}"""
                    .toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api = Retrofit.Builder().baseUrl("https://api.example/").client(client)
            .addConverterFactory(GsonConverterFactory.create()).build().create(WaymateApi::class.java)

        assertEquals("https://api.example/share/private-token", api.share("current-trip").url)
        assertEquals(1, requests)
    }
}
