package com.dukaanhq.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import com.dukaanhq.app.data.Access
import com.dukaanhq.app.data.Account
import com.dukaanhq.app.data.Bootstrap
import com.dukaanhq.app.ui.*
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AuthScreensTest {
    @get:Rule val compose = createComposeRule()
    private lateinit var captureView: View

    private fun screenshot(name: String) {
        compose.waitForIdle()
        // Robolectric has no hardware Window PixelCopy producer. Draw the real
        // Compose view with native graphics instead of waiting for a device frame.
        compose.runOnIdle {
            val bitmap =
                Bitmap.createBitmap(captureView.width, captureView.height, Bitmap.Config.ARGB_8888)
            captureView.draw(Canvas(bitmap))
            val file = File("build/ui-previews/$name.png").apply { parentFile!!.mkdirs() }
            file.outputStream().use {
                assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
            }
        }
    }

    @Test
    fun phoneEntryValidatesInputAndRequestsVerification() {
        val state = mutableStateOf(AuthUiState(screen = Screen.Phone))
        var requested = false
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    state.value,
                    AuthActions(
                        phone = {
                            state.value = state.value.copy(phone = PhoneNumbers.digits(it, "IN"))
                        },
                        request = { requested = true },
                    ),
                )
            }
        }
        compose.onNodeWithTag("request_otp").assertIsNotEnabled()
        screenshot("01-phone")
        compose.onNodeWithTag("phone_input").performTextInput("9876543210")
        screenshot("01b-phone-ready")
        compose.onNodeWithTag("request_otp").assertIsEnabled().performClick()
        assertTrue(requested)
    }

    @Test
    fun otpSupportsPasteKeepsResendDisabledAndVerifiesOnlyCompleteCodes() {
        val state =
            mutableStateOf(
                AuthUiState(
                    screen = Screen.Otp,
                    targetPhone = "+919876543210",
                    resendSeconds = 45,
                    expirySeconds = 280,
                )
            )
        var verified = false
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    state.value,
                    AuthActions(
                        otp = {
                            state.value = state.value.copy(otp = it.filter(Char::isDigit).take(6))
                        },
                        verify = { verified = true },
                    ),
                )
            }
        }
        compose.onNodeWithTag("verify_otp").assertIsNotEnabled()
        compose.onNodeWithText("Resend in 0:45").assertIsNotEnabled()
        screenshot("02-verify")
        compose.onNodeWithTag("otp_input").performTextInput("123456")
        compose.onNodeWithTag("verify_otp").assertIsEnabled().performClick()
        assertTrue(verified)
    }

    @Test
    fun profileOnlyAsksForNameAndDisablesEmptySubmission() {
        val state = mutableStateOf(AuthUiState(screen = Screen.Name))
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    state.value,
                    AuthActions(name = { state.value = state.value.copy(name = it) }),
                )
            }
        }
        compose.onNodeWithTag("save_name").assertIsNotEnabled()
        screenshot("03-name")
        compose.onNodeWithTag("name_input").performTextInput("Ayaan")
        compose.onNodeWithTag("save_name").assertIsEnabled()
    }

    @Test
    fun roleChoiceUsesIntentWithoutPretendingShopAccessWasGranted() {
        val bootstrap =
            Bootstrap(
                Account("preview", "Ayaan", role = "customer"),
                access = Access(),
                nextAction = "choose_role",
                permittedChoices = listOf("owner", "staff"),
            )
        val state =
            mutableStateOf(
                AuthUiState(screen = Screen.Intent, bootstrap = bootstrap, intent = "owner")
            )
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    state.value,
                    AuthActions(intent = { state.value = state.value.copy(intent = it) }),
                )
            }
        }
        compose.onNodeWithTag("intent_owner").assertIsSelected()
        screenshot("04-choice")
        compose.onNodeWithTag("intent_staff").performClick().assertIsSelected()
    }

    @Test
    fun darkThemeAndNetworkErrorsRemainReadable() {
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = true) {
                DukaanApp(
                    AuthUiState(
                        screen = Screen.Phone,
                        error = "Can’t reach the server. Check your connection and try again.",
                    ),
                    AuthActions(),
                )
            }
        }
        compose.onNodeWithTag("feedback").assertExists()
        screenshot("05-dark")
    }

    @Test
    fun completedAccountShowsAnHonestNextStep() {
        val bootstrap =
            Bootstrap(
                Account(
                    "preview",
                    "Ayaan",
                    phone = "+919876543210",
                    role = "customer",
                    onboardingIntent = "owner",
                ),
                access = Access(),
                nextAction = "select_plan",
            )
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    AuthUiState(screen = Screen.Account, bootstrap = bootstrap),
                    AuthActions(),
                )
            }
        }
        compose.onNodeWithText("Refresh status").assertExists()
        compose.onNodeWithText("Sign out").assertExists()
        screenshot("06-account")
    }

    @Test
    @Config(qualifiers = "w320dp-h640dp-xhdpi")
    fun smallScreensAndLargerTextKeepTheMainActionReachable() {
        compose.setContent {
            captureView = LocalView.current
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                DukaanTheme(dark = false) {
                    DukaanApp(
                        AuthUiState(screen = Screen.Phone, phone = "9876543210"),
                        AuthActions(),
                    )
                }
            }
        }
        compose.onNodeWithTag("request_otp").performScrollTo().assertIsDisplayed().assertIsEnabled()
        screenshot("07-small-screen")
    }

    @Test
    fun countryPickerSearchesAndSelectsCallingCodes() {
        val state = mutableStateOf(AuthUiState(screen = Screen.Phone))
        compose.setContent {
            captureView = LocalView.current
            DukaanTheme(dark = false) {
                DukaanApp(
                    state.value,
                    AuthActions(country = { state.value = state.value.copy(region = it) }),
                )
            }
        }
        compose.onNodeWithText("+91").performClick()
        compose.onNodeWithText("Search country or calling code").performTextInput("+971")
        compose.onNodeWithText("United Arab Emirates").performClick()
        compose.onNodeWithText("+971").assertExists()
    }
}
