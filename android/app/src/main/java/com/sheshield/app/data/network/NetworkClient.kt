package com.sheshield.app.data.network

import android.content.Context
import com.google.gson.Gson
import com.sheshield.app.BuildConfig
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.HttpException
import java.util.concurrent.TimeUnit

object NetworkClient {
    fun create(context: Context): WaymateApi {
        val prefs=context.getSharedPreferences("sheshield_prefs",Context.MODE_PRIVATE)
        val base=prefs.getString("backend_url",BuildConfig.BACKEND_BASE_URL)!!.trimEnd('/')+"/"
        val client=OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(25,TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val token=prefs.getString("session_token",null)
                val req=chain.request().newBuilder().header("User-Agent","Waymate/2.0")
                if(token!=null)req.header("Authorization","Bearer $token")
                // Two bounded provider attempts can take 30 seconds. Only route calculations
                // need this allowance; contact alerts and other commands keep their normal timeout.
                val path=chain.request().url.encodedPath
                val routing=path=="/v1/plans"||path.endsWith("/reroute")
                val connection=if(routing)chain.withReadTimeout(40,TimeUnit.SECONDS)else chain
                connection.proceed(req.build())
            }.build()
        return Retrofit.Builder().baseUrl(base).client(client).addConverterFactory(GsonConverterFactory.create()).build().create(WaymateApi::class.java)
    }
    fun message(e: Throwable): String = when(e) {
        is HttpException -> runCatching { Gson().fromJson(e.response()?.errorBody()?.string(),com.google.gson.JsonObject::class.java).get("message").asString }.getOrDefault(if(e.code()==530)"The API tunnel is offline. Check the saved API URL in Settings → Service connection." else "The server returned ${e.code()}. Please retry.")
        is java.net.UnknownHostException -> "The API address could not be found. Check Settings → Service connection; temporary tunnel addresses can expire."
        is java.net.ConnectException -> "The Waymate API is unreachable. Check that the API server and public connection are running."
        is java.net.SocketTimeoutException -> "The API connection timed out. Try again, then check readiness in Settings."
        is java.io.IOException -> "The API connection is unavailable. Check readiness in Settings → Service connection."
        else -> e.message ?: "Something went wrong. Please retry."
    }
}
