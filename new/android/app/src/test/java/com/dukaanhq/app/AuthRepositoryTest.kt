package com.dukaanhq.app

import com.dukaanhq.app.data.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class AuthRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var client: OkHttpClient
    private lateinit var store: MemorySessionStore
    private lateinit var repository: AuthRepository
    private val session = Session("access-old", "refresh-old", 5000)

    @Before
    fun setup() {
        server = MockWebServer().apply { start() }
        client =
            OkHttpClient.Builder()
                .retryOnConnectionFailure(false)
                .followRedirects(false)
                .callTimeout(3, TimeUnit.SECONDS)
                .build()
        store = MemorySessionStore()
        repository = AuthRepository(server.url("/"), client, store, nowSeconds = { 1000 })
    }

    @After
    fun close() {
        server.shutdown()
        client.connectionPool.evictAll()
        client.dispatcher.executorService.shutdown()
    }

    private fun json(body: String, status: Int = 200) =
        MockResponse()
            .setResponseCode(status)
            .setHeader("Content-Type", "application/json")
            .setBody(body)

    private fun bootstrap(name: String? = null) =
        Bootstrap(
            Account("user-one", name, role = "customer", phone = "+919876543210"),
            access = Access(),
            nextAction = if (name == null) "complete_profile" else "choose_role",
            permittedChoices = listOf("owner", "staff"),
        )

    private fun authenticatedBody(): String =
        wireJson.encodeToString(bootstrap()).dropLast(1) +
            ",\"session\":" +
            wireJson.encodeToString(session) +
            "}"

    private fun refreshed() =
        "{\"session\":" +
            wireJson.encodeToString(
                session.copy(accessToken = "access-new", refreshToken = "refresh-new")
            ) +
            "}"

    @Test
    fun `OTP request and verification match backend contract and save credentials`() = runTest {
        server.enqueue(
            json(
                """{"accepted":true,"retry_after_seconds":60,"otp_length":6,"expires_in_seconds":300}"""
            )
        )
        assertEquals(6, repository.requestOtp("+919876543210").otpLength)
        val request = server.takeRequest()
        assertEquals("/api/v1/auth/otp/request", request.path)
        assertNull(request.getHeader("Authorization"))
        assertEquals("""{"phone":"+919876543210"}""", request.body.readUtf8())
        server.enqueue(json(authenticatedBody()))
        assertEquals("complete_profile", repository.verifyOtp("+919876543210", "123456").nextAction)
        assertEquals(session, store.value)
        val verification = server.takeRequest()
        assertEquals("/api/v1/auth/otp/verify", verification.path)
        assertFalse(verification.path!!.contains("123456"))
        assertTrue(verification.body.readUtf8().contains("\"token\":\"123456\""))
    }

    @Test
    fun `concurrent protected calls coordinate one refresh and persist rotated tokens`() = runTest {
        store.value = session.copy(expiresAt = 999)
        val refreshes = AtomicInteger()
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse =
                    when (request.path) {
                        "/api/v1/auth/session/refresh" -> {
                            refreshes.incrementAndGet()
                            json(refreshed())
                        }
                        else -> {
                            assertEquals("Bearer access-new", request.getHeader("Authorization"))
                            json(wireJson.encodeToString(bootstrap("Owner")))
                        }
                    }
            }
        val first = async { repository.me() }
        val second = async { repository.me() }
        assertEquals("Owner", first.await().account.fullName)
        assertEquals("Owner", second.await().account.fullName)
        assertEquals(1, refreshes.get())
        assertEquals("refresh-new", store.value?.refreshToken)
    }

    @Test
    fun `transient refresh failure keeps credentials and does not replay the rotation`() = runTest {
        store.value = session.copy(expiresAt = 999)
        server.enqueue(
            json(
                """{"error":{"code":"AUTH_PROVIDER_UNAVAILABLE","message":"private provider detail"}}""",
                503,
            )
        )
        val failure = runCatching { repository.me() }.exceptionOrNull() as ApiFailure
        assertEquals(503, failure.status)
        assertNotNull(store.value)
        assertEquals(1, server.requestCount)
        assertFalse(failure.friendlyMessage.contains("private"))
    }

    @Test
    fun `invalid refresh clears session and requires sign in`() = runTest {
        store.value = session.copy(expiresAt = 999)
        server.enqueue(json("""{"error":{"code":"AUTHENTICATION_REQUIRED"}}""", 401))
        assertTrue(runCatching { repository.me() }.exceptionOrNull() is SessionEnded)
        assertNull(store.value)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `a rejected access token is refreshed once and a second rejection signs out`() = runTest {
        store.value = session
        server.enqueue(json("""{"error":{"code":"AUTHENTICATION_REQUIRED"}}""", 401))
        server.enqueue(json(refreshed()))
        server.enqueue(json("""{"error":{"code":"AUTHENTICATION_REQUIRED"}}""", 401))
        assertTrue(runCatching { repository.me() }.exceptionOrNull() is SessionEnded)
        assertNull(store.value)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun `sign out clears local credentials even if remote revocation fails`() = runTest {
        store.value = session
        server.enqueue(json("""{"error":{"code":"AUTH_PROVIDER_UNAVAILABLE"}}""", 503))
        assertTrue(runCatching { repository.logout() }.isFailure)
        assertNull(store.value)
        assertEquals("Bearer access-old", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `local storage failure is distinguished from remote sign out failure`() = runTest {
        store.value = session
        store.failClear = true
        assertTrue(
            runCatching { repository.logout() }.exceptionOrNull() is CredentialStorageFailure
        )
        assertNotNull(store.value)
        assertEquals(0, server.requestCount)
        store.failClear = false
        server.enqueue(MockResponse().setResponseCode(204))
        repository.logout()
        assertNull(store.value)
    }

    @Test
    fun `changing servers discards in-flight login credentials and never forwards them`() =
        runTest {
            val other = MockWebServer().apply { start() }
            try {
                server.enqueue(json(authenticatedBody()).setBodyDelay(400, TimeUnit.MILLISECONDS))
                val verification = async {
                    runCatching { repository.verifyOtp("+919876543210", "123456") }
                }
                // Let the request start without blocking the coroutine test dispatcher.
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    server.takeRequest(2, TimeUnit.SECONDS)
                }
                repository.changeEndpoint(other.url("/"))
                assertTrue(verification.await().isFailure)
                assertNull(store.value)
                other.enqueue(
                    json(
                        """{"accepted":true,"retry_after_seconds":60,"otp_length":6,"expires_in_seconds":300}"""
                    )
                )
                repository.requestOtp("+919876543210")
                assertNull(other.takeRequest().getHeader("Authorization"))
            } finally {
                other.shutdown()
            }
        }

    @Test
    fun `production endpoint validation rejects HTTP credentials paths and query strings`() {
        for (url in
            listOf(
                "http://example.com/",
                "https://user:secret@example.com/",
                "https://example.com/api/",
                "https://example.com/?token=secret",
            )) {
            assertTrue(runCatching { ApiEndpoint.parse(url, false) }.isFailure)
        }
        assertEquals(
            "https://example.com/",
            ApiEndpoint.parse("https://example.com", false).toString(),
        )
    }

    @Test
    fun `server retry timing and OTP errors are exposed without raw provider text`() = runTest {
        server.enqueue(
            json("""{"error":{"code":"OTP_RATE_LIMITED","message":"secret detail"}}""", 429)
                .setHeader("Retry-After", "60")
        )
        val failure =
            runCatching { repository.requestOtp("+919876543210") }.exceptionOrNull() as ApiFailure
        assertEquals(60, failure.retryAfterSeconds)
        assertFalse(failure.friendlyMessage.contains("secret"))
    }
}

class MemorySessionStore : SessionStore {
    var value: Session? = null
    var failClear = false

    override suspend fun read() = value

    override suspend fun save(session: Session) {
        value = session
    }

    override suspend fun clear() {
        if (failClear) throw java.io.IOException("Test storage failure")
        value = null
    }
}
