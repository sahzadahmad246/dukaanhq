package com.dukaanhq.app.ui

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.dukaanhq.app.BuildConfig
import com.dukaanhq.app.data.ApiEndpoint
import com.dukaanhq.app.data.ApiFailure
import com.dukaanhq.app.data.AuthRepository
import com.dukaanhq.app.data.Bootstrap
import com.dukaanhq.app.data.CredentialStorageFailure
import com.dukaanhq.app.data.SessionEnded
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Screen {
    Restoring,
    Phone,
    Otp,
    Name,
    Intent,
    Account,
    Recovery,
}

private enum class Operation {
    Other,
    Send,
    Verify,
}

data class AuthUiState(
    val screen: Screen = Screen.Restoring,
    val region: String = "IN",
    val phone: String = "",
    val targetPhone: String = "",
    val otp: String = "",
    val otpLength: Int = 6,
    val name: String = "",
    val intent: String? = null,
    val resendSeconds: Int = 0,
    val expirySeconds: Int = 0,
    val verifyWaitSeconds: Int = 0,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val bootstrap: Bootstrap? = null,
    val linkingPhone: Boolean = false,
    val editingName: Boolean = false,
    val endpoint: String = "",
    val serverResult: String? = null,
) {
    val validPhone: Boolean
        get() = PhoneNumbers.international(phone, region) != null

    val validName: Boolean
        get() = name.trim().length in 1..80 && name.none { Character.isISOControl(it) }
}

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val mutable = MutableStateFlow(AuthUiState(endpoint = repository.endpoint))
    val state = mutable.asStateFlow()
    private var countdown: Job? = null
    private var resendAt = 0L
    private var expiryAt = 0L
    private var verifyAt = 0L

    init {
        restore()
    }

    fun phone(value: String) {
        if (!state.value.busy)
            mutable.update { it.copy(phone = PhoneNumbers.digits(value, it.region), error = null) }
    }

    fun country(value: String) {
        if (!state.value.busy) mutable.update { it.copy(region = value, phone = "", error = null) }
    }

    fun otp(value: String) {
        if (!state.value.busy)
            mutable.update {
                it.copy(
                    otp = value.filter { character -> character in '0'..'9' }.take(it.otpLength),
                    error = null,
                )
            }
    }

    fun name(value: String) {
        if (!state.value.busy) mutable.update { it.copy(name = value.take(80), error = null) }
    }

    fun intent(value: String) {
        if (!state.value.busy && value in listOf("owner", "staff"))
            mutable.update { it.copy(intent = value, error = null) }
    }

    fun restore() = perform {
        val bootstrap = repository.restore()
        if (bootstrap == null)
            mutable.update { AuthUiState(screen = Screen.Phone, endpoint = repository.endpoint) }
        else show(bootstrap)
    }

    fun requestOtp(resend: Boolean = false) {
        val before = state.value
        if (before.busy) return
        if (resend && before.resendSeconds > 0) return
        val phone =
            if (resend) before.targetPhone
            else PhoneNumbers.international(before.phone, before.region) ?: return
        mutable.update { it.copy(targetPhone = phone) }
        perform(Operation.Send) {
            val accepted =
                if (before.linkingPhone) repository.requestLink(phone)
                else repository.requestOtp(phone)
            require(accepted.accepted && accepted.otpLength in 6..10)
            resendAt =
                SystemClock.elapsedRealtime() +
                    accepted.retryAfterSeconds.coerceIn(1, 86400) * 1000L
            expiryAt =
                SystemClock.elapsedRealtime() + accepted.expiresInSeconds.coerceIn(1, 3600) * 1000L
            if (phone != before.targetPhone) verifyAt = 0L
            mutable.update {
                it.copy(
                    screen = Screen.Otp,
                    targetPhone = phone,
                    otp = "",
                    otpLength = accepted.otpLength,
                    error = null,
                    notice = if (resend) "A new code is on its way." else null,
                )
            }
            startCountdown()
        }
    }

    fun verify() {
        val before = state.value
        if (before.otp.length != before.otpLength || before.verifyWaitSeconds > 0) return
        perform(Operation.Verify) {
            val response =
                if (before.linkingPhone) repository.verifyLink(before.targetPhone, before.otp)
                else repository.verifyOtp(before.targetPhone, before.otp)
            mutable.update { it.copy(otp = "", linkingPhone = false) }
            show(response)
        }
    }

    fun saveName() {
        val name = state.value.name.trim()
        if (!state.value.validName) return
        perform { show(repository.profile(name)) }
    }

    fun saveIntent() {
        val selected = state.value.intent ?: return
        perform { show(repository.intent(selected)) }
    }

    fun refresh() = perform { show(repository.me()) }

    fun editName() {
        mutable.update {
            it.copy(
                screen = Screen.Name,
                editingName = true,
                name = it.bootstrap?.account?.fullName.orEmpty(),
                error = null,
            )
        }
    }

    fun linkPhone() {
        mutable.update {
            it.copy(screen = Screen.Phone, linkingPhone = true, phone = "", error = null)
        }
    }

    fun back() {
        if (state.value.busy) return
        mutable.update { before ->
            when (before.screen) {
                Screen.Otp ->
                    before.copy(screen = Screen.Phone, otp = "", error = null, notice = null)
                Screen.Phone ->
                    if (before.linkingPhone)
                        before.copy(screen = Screen.Account, linkingPhone = false, error = null)
                    else before
                Screen.Name ->
                    if (before.editingName)
                        before.copy(screen = Screen.Account, editingName = false, error = null)
                    else before
                else -> before
            }
        }
    }

    fun signOut() {
        if (state.value.busy) return
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            var remoteFailed = false
            try {
                repository.logout()
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (_: CredentialStorageFailure) {
                mutable.update {
                    it.copy(
                        busy = false,
                        error = "Couldn’t remove the saved session. Please try signing out again.",
                    )
                }
                return@launch
            } catch (_: Exception) {
                remoteFailed = true
            }
            countdown?.cancel()
            resendAt = 0
            expiryAt = 0
            verifyAt = 0
            mutable.value =
                AuthUiState(
                    screen = Screen.Phone,
                    endpoint = repository.endpoint,
                    notice =
                        if (remoteFailed)
                            "Signed out on this device. Server sign-out could not be confirmed."
                        else "You’re signed out.",
                )
        }
    }

    fun changeServer(value: String) {
        if (!BuildConfig.DEBUG) return
        val endpoint =
            try {
                ApiEndpoint.parse(value, true)
            } catch (error: IllegalArgumentException) {
                mutable.update { it.copy(serverResult = error.message) }
                return
            }
        perform {
            repository.changeEndpoint(endpoint)
            countdown?.cancel()
            mutable.value =
                AuthUiState(
                    screen = Screen.Phone,
                    endpoint = repository.endpoint,
                    serverResult = "Server saved. Sign in to continue.",
                )
        }
    }

    fun checkServer() = perform {
        mutable.update {
            it.copy(
                serverResult =
                    if (repository.checkServer()) "Connected. Backend is ready."
                    else
                        "Server reached, but backend setup is incomplete. Check /health/ready and the setup guide."
            )
        }
    }

    private fun show(bootstrap: Bootstrap) {
        countdown?.cancel()
        verifyAt = 0L
        val screen =
            when (bootstrap.nextAction) {
                "complete_profile" -> Screen.Name
                "choose_role" -> Screen.Intent
                else -> Screen.Account
            }
        mutable.update {
            it.copy(
                screen = screen,
                bootstrap = bootstrap,
                name = bootstrap.account.fullName.orEmpty(),
                intent = bootstrap.account.onboardingIntent,
                editingName = false,
                error = null,
                notice = null,
                verifyWaitSeconds = 0,
            )
        }
    }

    private fun perform(kind: Operation = Operation.Other, operation: suspend () -> Unit) {
        if (state.value.busy) return
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                operation()
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (_: SessionEnded) {
                countdown?.cancel()
                mutable.value =
                    AuthUiState(
                        screen = Screen.Phone,
                        endpoint = repository.endpoint,
                        error = "Your session has ended. Please sign in again.",
                    )
            } catch (failure: ApiFailure) {
                if (failure.status == 429 && kind != Operation.Other) {
                    val until =
                        SystemClock.elapsedRealtime() +
                            failure.retryAfterSeconds.coerceAtLeast(1) * 1000L
                    if (kind == Operation.Verify) verifyAt = until else resendAt = until
                    startCountdown()
                }
                mutable.update {
                    it.copy(
                        screen = if (it.screen == Screen.Restoring) Screen.Recovery else it.screen,
                        error = failure.friendlyMessage,
                        otp = if (failure.code == "OTP_INVALID_OR_EXPIRED") "" else it.otp,
                    )
                }
            } catch (_: IOException) {
                mutable.update {
                    it.copy(
                        screen = if (it.screen == Screen.Restoring) Screen.Recovery else it.screen,
                        error = "Can’t reach the server. Check your connection and try again.",
                    )
                }
            } catch (_: Exception) {
                mutable.update {
                    it.copy(
                        screen = if (it.screen == Screen.Restoring) Screen.Recovery else it.screen,
                        error = "Something went wrong. Please try again.",
                    )
                }
            } finally {
                mutable.update { it.copy(busy = false) }
            }
        }
    }

    private fun startCountdown() {
        countdown?.cancel()
        countdown = viewModelScope.launch {
            do {
                val now = SystemClock.elapsedRealtime()
                fun remaining(deadline: Long) =
                    ((deadline - now + 999) / 1000).coerceIn(0, 86400).toInt()
                mutable.update {
                    it.copy(
                        resendSeconds = remaining(resendAt),
                        expirySeconds = remaining(expiryAt),
                        verifyWaitSeconds = remaining(verifyAt),
                    )
                }
                delay(1000)
            } while (
                state.value.screen in listOf(Screen.Phone, Screen.Otp) &&
                    (state.value.resendSeconds > 0 ||
                        state.value.expirySeconds > 0 ||
                        state.value.verifyWaitSeconds > 0)
            )
        }
    }

    companion object {
        fun factory(repository: AuthRepository) =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    AuthViewModel(repository) as T
            }
    }
}
