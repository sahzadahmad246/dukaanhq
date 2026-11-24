# DukaanHQ Android — authentication test app

Native Kotlin / Jetpack Compose app for testing the Phase 2 Nest API. Uses the existing
DukaanHQ logo, yellow/charcoal branding, light/dark themes and short screen transitions.
This milestone covers phone sign-in and account setup. Shop creation, checkout,
inventory and billing remain later phases; the app labels their availability honestly.

## First: connect SMS and the backend

Follow [the easy Twilio/Supabase/env guide](../docs/SMS_SETUP.md). Twilio credentials
go into Supabase Auth. **Android needs only the Nest API URL**, no Twilio or Supabase keys.
Backend readiness must return 200 before live testing. No SMS was sent while building this app.

## Build and install

Open this `new/android` directory in Android Studio, or use the included Gradle wrapper.
The toolchain uses JDK 17+ (tested on 21), SDK platform 35 and Build Tools 35.0.0.
Gradle 8.11.1, AGP 8.9.2, Kotlin 2.1.20 and the Compose BOM are pinned for that SDK.
Target SDK 35 is this test-build baseline; review SDK/store requirements before release.

Create a local `local.properties` (ignored by Git):

```properties
sdk.dir=/YOUR/ANDROID/SDK/PATH
API_BASE_URL=http://10.0.2.2:4000/
```

Or set `ANDROID_HOME` and supply `-PAPI_BASE_URL=...` on the command line. Build:

```bash
cd new/android
./gradlew :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.
The debug app ID is `com.dukaanhq.app.debug`, signed with your local debug key.
Install the APK on your test phone, or use a USB device:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:4000 tcp:4000
```

In the app, tap the top-right **connection settings** icon (debug builds only). Set:

- Emulator: `http://10.0.2.2:4000/`.
- USB with the reverse command above: `http://127.0.0.1:4000/`.
- Same Wi-Fi: `http://YOUR_COMPUTER_LAN_IP:4000/`, with backend `HOST=0.0.0.0`.

Tap **Use this server**, then **Check connection**. Changing servers signs out locally;
credentials and pending login responses are not carried to the new host. Use the API
root without `/api/v1`, credentials, query strings or fragments.

Release builds reject a missing/non-HTTPS `RELEASE_API_BASE_URL`, disable cleartext HTTP
and omit the connection editor. Production signing/distribution is not configured yet.
Never commit signing keys or put provider secrets in Android/Gradle settings.

## What you can test

1. Choose a country and enter a valid national number (India: +91 and ten digits).
2. Request SMS. The code screen supports full-code paste, configured code length,
   expiry, resend countdown and friendly errors/rate-limit feedback.
3. Verify. New users enter only their name, then choose register-shop/join-staff intent.
4. Existing users see the backend's account/access state. Pending plan/onboarding/staff
   operations show current availability instead of fake success or invented shop metrics.
5. Edit the name, refresh status, sign out, reopen and test session recovery.
6. Turn off connectivity and retry. Transient failures preserve credentials; invalid refresh
   credentials return to sign-in. Local logout and unconfirmed remote revocation are distinguished.

Authenticated accounts without a phone have a phone-link action wired to the Phase 2 endpoints.
**A Google OAuth entry screen is not included yet.** Existing Google-only shop owners must
link their phone while authenticated as their original account before using phone sign-in.
The app never merges accounts by shop contact numbers. Use a fresh staging test user for
the first phone-only flow rather than assuming an unlinked number identifies an old shop.

Native CAPTCHA challenge UI is pending. If Supabase requires CAPTCHA, the app shows a
security-check-required error. Use a private development project with suitable test settings;
do not disable existing production abuse protection for an APK test.

## Implementation

- State-driven Compose, lifecycle-aware collection; no network requests per recomposition.
- Shared OkHttp pool, bounded timeouts, cancellation and body parsing off the main thread.
- No automatic POST/refresh retries or HTTP body logs; refresh is coordinated with a mutex.
- AES-GCM session encryption with an Android Keystore key. Credential preferences are excluded
  from backup/device transfer. No OTP/profile permission cache is persisted. Invalid/corrupt
  credentials are discarded; there is no plaintext fallback.
- Fresh `/me` access checks after recreation. Intent never grants local permissions.
- No SMS-reading/sending, contacts or camera permissions. Actual Keystore behavior and SMS
  delivery still need a real-device/staging check; JVM tests do not prove hardware-key behavior.

## Checks and screen renders

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

Tests cover HTTP contracts, coordinated rotation, failures/logout, server-change isolation,
phone validation and Compose field/choice states. Native Robolectric rendering writes
`app/build/ui-previews/*.png`. These are test fixtures, not an installed-app mock-login mode.

The logo is copied unchanged from `web/public/logo.png`. Build outputs/config/credentials stay
ignored. Lint may report newer-version suggestions for the pinned SDK 35 toolchain; those
are not errors or evidence of a tested newer SDK migration.

Current evidence: **20 tests passed**, debug APK and lint successful. See the
[milestone notes and rendered screen previews](../docs/android-auth.md).
