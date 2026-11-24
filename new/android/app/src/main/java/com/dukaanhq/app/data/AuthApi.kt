package com.dukaanhq.app.data

import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

val wireJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

object ApiEndpoint {
    fun parse(value: String, allowLocalHttp: Boolean): HttpUrl {
        val url =
            value.trim().toHttpUrlOrNull()
                ?: throw IllegalArgumentException("Enter a valid API URL.")
        require(url.isHttps || allowLocalHttp && url.scheme == "http") { "Use an HTTPS API URL." }
        require(
            url.username.isEmpty() &&
                url.password.isEmpty() &&
                url.query == null &&
                url.fragment == null &&
                url.encodedPath == "/"
        ) {
            "Use the server address only, without a path, password or query."
        }
        return url
    }
}

class AuthApi(private val baseUrl: HttpUrl, private val client: OkHttpClient) {
    suspend fun requestOtp(phone: String): OtpAccepted =
        wireJson.decodeFromJsonElement(
            request("otp/request", "POST", buildJsonObject { put("phone", phone) })
        )

    suspend fun verifyOtp(phone: String, code: String): Authenticated =
        authResult(
            request(
                "otp/verify",
                "POST",
                buildJsonObject {
                    put("phone", phone)
                    put("token", code)
                },
            )
        )

    suspend fun refresh(refreshToken: String): Session {
        val response =
            request(
                "session/refresh",
                "POST",
                buildJsonObject { put("refresh_token", refreshToken) },
            )
        return wireJson.decodeFromJsonElement(response.getValue("session"))
    }

    suspend fun me(accessToken: String): Bootstrap =
        wireJson.decodeFromJsonElement(request("me", "GET", token = accessToken))

    suspend fun profile(accessToken: String, name: String): Bootstrap =
        wireJson.decodeFromJsonElement(
            request("profile", "PATCH", buildJsonObject { put("full_name", name) }, accessToken)
        )

    suspend fun intent(accessToken: String, intent: String): Bootstrap =
        wireJson.decodeFromJsonElement(
            request("intent", "PATCH", buildJsonObject { put("intent", intent) }, accessToken)
        )

    suspend fun logout(accessToken: String) {
        request("session/logout", "POST", token = accessToken)
    }

    suspend fun requestLink(accessToken: String, phone: String): OtpAccepted =
        wireJson.decodeFromJsonElement(
            request(
                "phone/link/request",
                "POST",
                buildJsonObject { put("phone", phone) },
                accessToken,
            )
        )

    suspend fun verifyLink(accessToken: String, phone: String, code: String): Authenticated =
        authResult(
            request(
                "phone/link/verify",
                "POST",
                buildJsonObject {
                    put("phone", phone)
                    put("token", code)
                },
                accessToken,
            )
        )

    suspend fun readiness(): Boolean =
        withContext(Dispatchers.IO) {
            response(Request.Builder().url(baseUrl.resolve("health/ready")!!).get().build()).use {
                it.isSuccessful
            }
        }

    private fun authResult(body: JsonObject) =
        Authenticated(
            session = wireJson.decodeFromJsonElement(body.getValue("session")),
            bootstrap = wireJson.decodeFromJsonElement(body),
        )

    private suspend fun request(
        path: String,
        method: String,
        body: JsonObject? = null,
        token: String? = null,
    ): JsonObject =
        withContext(Dispatchers.IO) {
            val url = baseUrl.resolve("api/v1/auth/$path")!!
            val request = Request.Builder().url(url).header("Accept", "application/json")
            token?.let { request.header("Authorization", "Bearer $it") }
            val payload =
                body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
            request.method(
                method,
                if (method == "POST") payload ?: ByteArray(0).toRequestBody() else payload,
            )
            response(request.build()).use { result ->
                val source = result.body?.source()
                if (source != null && source.request(1_048_577) && source.buffer.size > 1_048_576)
                    throw IOException("Response exceeded limit")
                val text = result.body?.string().orEmpty()
                if (!result.isSuccessful) {
                    val code =
                        runCatching {
                            wireJson
                                .parseToJsonElement(text)
                                .jsonObject["error"]
                                ?.jsonObject
                                ?.get("code")
                                ?.jsonPrimitive
                                ?.content
                        }
                            .getOrNull() ?: "REQUEST_FAILED"
                    val retry = result.header("Retry-After")?.toIntOrNull()?.coerceIn(0, 86400) ?: 0
                    throw ApiFailure(result.code, code, retry)
                }
                if (result.code == 204) JsonObject(emptyMap())
                else wireJson.parseToJsonElement(text).jsonObject
            }
        }

    private suspend fun response(request: Request): Response =
        suspendCancellableCoroutine { continuation ->
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(
                object : Callback {
                    override fun onFailure(call: Call, error: IOException) {
                        if (!continuation.isCancelled) continuation.resumeWithException(error)
                    }

                    override fun onResponse(call: Call, response: Response) {
                        if (continuation.isCancelled) response.close()
                        else continuation.resume(response) { _, value, _ -> value.close() }
                    }
                }
            )
        }
}
