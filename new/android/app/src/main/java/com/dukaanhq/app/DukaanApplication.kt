package com.dukaanhq.app

import android.app.Application
import com.dukaanhq.app.data.ApiEndpoint
import com.dukaanhq.app.data.AuthRepository
import com.dukaanhq.app.data.KeystoreSessionStore
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

class DukaanApplication : Application() {
    val repository: AuthRepository by lazy {
        val preferences = getSharedPreferences("dukaanhq_connection", MODE_PRIVATE)
        val configured =
            if (BuildConfig.DEBUG) preferences.getString("api_url", BuildConfig.API_BASE_URL)!!
            else BuildConfig.API_BASE_URL
        val endpoint = runCatching {
            ApiEndpoint.parse(configured, BuildConfig.DEBUG)
        }
            .getOrElse { ApiEndpoint.parse(BuildConfig.API_BASE_URL, BuildConfig.DEBUG) }
        // One shared connection pool, bounded timeouts, no token/body HTTP logging.
        val client =
            OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .callTimeout(20, TimeUnit.SECONDS)
                .followRedirects(false)
                .followSslRedirects(false)
                .retryOnConnectionFailure(false)
                .build()
        AuthRepository(
            endpoint,
            client,
            KeystoreSessionStore(this),
            saveEndpoint = { url ->
                check(preferences.edit().putString("api_url", url).commit())
            },
        )
    }
}
