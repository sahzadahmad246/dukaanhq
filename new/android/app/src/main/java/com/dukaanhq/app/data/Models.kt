package com.dukaanhq.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long,
    @SerialName("expires_in") val expiresIn: Long = 3600,
    @SerialName("token_type") val tokenType: String = "bearer",
)

@Serializable
data class Account(
    val id: String,
    @SerialName("full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val role: String,
    @SerialName("onboarding_intent") val onboardingIntent: String? = null,
)

@Serializable
data class Membership(
    @SerialName("shop_id") val shopId: String,
    @SerialName("shop_slug") val shopSlug: String,
    val role: String,
    val status: String,
    @SerialName("shop_status") val shopStatus: String,
    @SerialName("onboarding_completed") val onboardingCompleted: Boolean,
)

@Serializable
data class Access(
    val workspace: Boolean = false,
    @SerialName("can_manage_staff") val canManageStaff: Boolean = false,
    @SerialName("can_manage_subscription") val canManageSubscription: Boolean = false,
    @SerialName("can_onboard_shop") val canOnboardShop: Boolean = false,
    @SerialName("platform_admin") val platformAdmin: Boolean = false,
)

@Serializable
data class Bootstrap(
    val account: Account,
    val membership: Membership? = null,
    val access: Access,
    @SerialName("next_action") val nextAction: String,
    @SerialName("permitted_choices") val permittedChoices: List<String> = emptyList(),
    @SerialName("approved_intent_id") val approvedIntentId: String? = null,
)

@Serializable
data class OtpAccepted(
    val accepted: Boolean,
    @SerialName("retry_after_seconds") val retryAfterSeconds: Int,
    @SerialName("otp_length") val otpLength: Int,
    @SerialName("expires_in_seconds") val expiresInSeconds: Int,
)

data class Authenticated(val session: Session, val bootstrap: Bootstrap)

class ApiFailure(
    val status: Int,
    val code: String,
    val retryAfterSeconds: Int = 0,
) : Exception(code) {
    val friendlyMessage: String
        get() =
            when (code) {
                "OTP_INVALID_OR_EXPIRED" ->
                    "That code is incorrect or has expired. Check it and try again."
                "PHONE_LINK_INVALID_OR_EXPIRED" ->
                    "This phone verification has expired. Please request a new code."
                "PHONE_ALREADY_LINKED" -> "This account already has a verified phone number."
                "CAPTCHA_REQUIRED" ->
                    "A security check is required. Please contact the app administrator."
                "VALIDATION_ERROR" -> "Check your details and try again."
                "AUTH_NOT_CONFIGURED" -> "Sign-in is not available yet. Please try again shortly."
                else ->
                    when (status) {
                        401 -> "Your session has ended. Please sign in again."
                        429 -> "Too many attempts. Please wait before trying again."
                        503 -> "We couldn’t connect to your account. Please try again shortly."
                        else -> "Something went wrong. Please try again."
                    }
            }
}

class SessionEnded : Exception()

class CredentialStorageFailure : Exception()
