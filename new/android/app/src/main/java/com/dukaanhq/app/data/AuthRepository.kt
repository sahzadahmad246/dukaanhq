package com.dukaanhq.app.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

class AuthRepository(
    initialEndpoint: HttpUrl,
    private val client: OkHttpClient,
    private val store: SessionStore,
    private val saveEndpoint: (String) -> Unit = {},
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private data class Connection(val url: HttpUrl, val api: AuthApi, val generation: Long)

    @Volatile
    private var connection = Connection(initialEndpoint, AuthApi(initialEndpoint, client), 0)
    private val sessionMutex = Mutex()
    private var loaded = false
    private var session: Session? = null
    val endpoint: String
        get() = connection.url.toString()

    suspend fun restore(): Bootstrap? {
        val exists = sessionMutex.withLock {
            loadLocked()
            session != null
        }
        return if (exists) me() else null
    }

    suspend fun requestOtp(phone: String): OtpAccepted = connection.api.requestOtp(phone)

    suspend fun verifyOtp(phone: String, code: String): Bootstrap {
        val current = connection
        val response = current.api.verifyOtp(phone, code)
        persist(current, response.session)
        return response.bootstrap
    }

    suspend fun me(): Bootstrap = authenticated { api, token -> api.me(token) }

    suspend fun profile(name: String): Bootstrap = authenticated { api, token ->
        api.profile(token, name)
    }

    suspend fun intent(value: String): Bootstrap = authenticated { api, token ->
        api.intent(token, value)
    }

    suspend fun requestLink(phone: String): OtpAccepted = authenticated { api, token ->
        api.requestLink(token, phone)
    }

    suspend fun verifyLink(phone: String, code: String): Bootstrap {
        val current = connection
        val response = authenticated { api, token -> api.verifyLink(token, phone, code) }
        persist(current, response.session)
        return response.bootstrap
    }

    suspend fun checkServer(): Boolean = connection.api.readiness()

    suspend fun logout() {
        val current = connection
        val token =
            withContext(NonCancellable) {
                sessionMutex.withLock {
                    loadLocked()
                    val saved = session?.accessToken
                    try {
                        store.clear()
                    } catch (_: Exception) {
                        throw CredentialStorageFailure()
                    }
                    session = null
                    loaded = true
                    saved
                }
            }
        if (token != null) current.api.logout(token)
    }

    suspend fun changeEndpoint(url: HttpUrl) = sessionMutex.withLock {
        // Changing a debug server always signs out before any token can go to it.
        store.clear()
        session = null
        loaded = true
        withContext(Dispatchers.IO) { saveEndpoint(url.toString()) }
        connection = Connection(url, AuthApi(url, client), connection.generation + 1)
    }

    private suspend fun loadLocked() {
        if (!loaded) {
            session = store.read()
            loaded = true
        }
    }

    private fun checkConnection(current: Connection) {
        if (connection !== current) throw CancellationException("API endpoint changed")
    }

    private suspend fun persist(current: Connection, value: Session) = sessionMutex.withLock {
        checkConnection(current)
        store.save(value)
        session = value
        loaded = true
    }

    private suspend fun validSession(current: Connection, rejectedToken: String? = null): Session =
        sessionMutex.withLock {
            checkConnection(current)
            loadLocked()
            val saved = session ?: throw SessionEnded()
            if (rejectedToken != null && saved.accessToken != rejectedToken) return@withLock saved
            if (rejectedToken == null && saved.expiresAt > nowSeconds() + 30) return@withLock saved
            try {
                val updated = current.api.refresh(saved.refreshToken)
                checkConnection(current)
                store.save(updated)
                session = updated
                updated
            } catch (failure: ApiFailure) {
                if (failure.status == 401) {
                    store.clear()
                    session = null
                    throw SessionEnded()
                }
                throw failure // Keep credentials through transient outages; never repeat rotation
                // blindly.
            }
        }

    private suspend fun <T> authenticated(operation: suspend (AuthApi, String) -> T): T {
        val current = connection
        val first = validSession(current)
        try {
            return operation(current.api, first.accessToken).also { checkConnection(current) }
        } catch (failure: ApiFailure) {
            if (failure.status != 401) throw failure
            val refreshed = validSession(current, first.accessToken)
            try {
                return operation(current.api, refreshed.accessToken).also {
                    checkConnection(current)
                }
            } catch (retry: ApiFailure) {
                if (retry.status == 401) {
                    sessionMutex.withLock {
                        if (session?.accessToken == refreshed.accessToken) {
                            store.clear()
                            session = null
                        }
                    }
                    throw SessionEnded()
                }
                throw retry
            }
        }
    }
}
