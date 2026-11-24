# Easy setup: Twilio → Supabase → DukaanHQ → Android

Use a staging Supabase project/copy while testing. The code is ready, but real SMS
will work only after the provider, SQL migration and backend connection are configured.

## 1. Get these from Twilio

Open [Twilio Console](https://console.twilio.com/).

1. **Account SID** (`AC...`) and **Auth Token**: these already exist in your current
   WhatsApp configuration, and the earlier read-only check confirmed they are valid.
   Reuse them. You do not need a separate API Key SID/Secret for this integration.
2. **An SMS sender**: open **Phone Numbers → Manage → Active numbers**. Choose/configure
   a sender that supports SMS to your destination country. The earlier account check
   found no owned SMS-capable number. A WhatsApp sandbox sender is not an SMS sender.
3. Copy the sender number, including `+` and country code. If using a Messaging Service,
   open **Messaging → Services**, add the correct SMS sender to its sender pool and
   note the service SID (`MG...`). Existing WhatsApp services alone are not enough.

The official Supabase Twilio guide permits the **sender phone number** in the field
labelled **Twilio Message Service SID**. This is the easiest documented setup for a
single sender; follow the provider form's guidance if using a Messaging Service instead.

Enable SMS destination permissions for the countries you need. Trial-account recipient
restrictions and country-specific sender requirements still apply. For Indian recipients,
follow [Twilio's India SMS guidance](https://www.twilio.com/en-us/guidelines/in/sms)
for your chosen international/domestic route before purchasing/configuring a sender.

Do not paste Auth Tokens into chat, Android files or Git.

## 2. Configure Supabase

Open [Supabase Dashboard](https://supabase.com/dashboard), choose your staging project:

1. Go to **Authentication → Sign In / Providers → Phone** (some dashboards show
   **Authentication → Providers → Phone**).
2. Enable **Phone** and choose SMS provider **Twilio**. Do not select **Twilio Verify**
   for these instructions; that is a separate provider using a `VA...` Verify Service SID.
3. Enter the existing **Twilio Account SID** and **Auth Token**.
4. In **Twilio Message Service SID**, enter the SMS sender phone number as supported
   by Supabase's guide, or your correctly configured Messaging Service value.
5. Leave **Twilio Content SID** empty for SMS. It is for WhatsApp content templates.
6. Set a message such as `Your DukaanHQ verification code is {{ .Code }}`.
7. Set OTP length **6**, expiry **300 seconds**, minimum resend interval **60 seconds**.
   Match the actual values available in your dashboard with the backend env below.
8. Allow new phone signups and keep phone/SMS **auto-confirm disabled**.
9. Save. Configure Supabase's own SMS rate limits and abuse controls too.

Official instructions: [Supabase phone login with Twilio](https://supabase.com/docs/guides/auth/phone-login?showSmsProvider=Twilio).
SMS is sent by Supabase through Twilio. Our backend does not need the Twilio SDK/keys.

For the first test, you may configure **Supabase test phone numbers/fixed OTPs** in
staging instead of sending SMS. This is a Supabase test setting, not a bypass in our API.
If CAPTCHA is enabled, a real CAPTCHA token is also required; see the Android notes below.

## 3. Prepare the database once

In the staging project's **SQL Editor**, review/run only
[046_mobile_phone_auth.sql](../../web/db/046_mobile_phone_auth.sql).
Do not rerun old reset/data-deletion migrations. SQL 046 preserves existing account IDs,
permits NULL emails for phone-only users and adds intent/platform-role protection.

The backend uses a dedicated PostgreSQL login, not the Supabase service-role API key.
If you do not have that login yet, generate a strong database password and run this
in the staging SQL Editor, replacing the password placeholder:

```sql
create role dukaan_api login password 'REPLACE_WITH_A_RANDOM_DATABASE_PASSWORD'
  nosuperuser nocreatedb nocreaterole nobypassrls noinherit;
grant authenticated to dukaan_api;
grant usage on schema public to dukaan_api;
-- Readiness checks use information_schema; these RLS-protected grants expose metadata.
grant select on public.profiles, public.products to dukaan_api;
```

Use **Connect → Direct connection** or **Session pooler** connection details, with this
login and password. Avoid the transaction pooler for the current session configuration.
Session-pool usernames may require the project-reference suffix shown by Supabase.
Keep TLS verification enabled. The backend changes to the `authenticated` role and
sets the verified user's claims locally inside every tenant transaction.

## 4. Backend env: `new/backend/.env`

Use `new/backend/.env` if it already exists; otherwise copy `.env.example` to `.env`.
Fill these values locally:

If this checkout already has `.env`, keep it: the setup helper may have prefilled the
existing project's public URL/key and a generated OTP rate secret. Auth stays disabled
until setup is complete. For a separate staging project, replace both public project
values and use its matching database. Restart `bun dev` after changing env settings.

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=4000

AUTH_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
DATABASE_URL=postgresql://YOUR_LIMITED_LOGIN:YOUR_PASSWORD@YOUR_DB_HOST:5432/postgres
DATABASE_SSL=true
NODE_EXTRA_CA_CERTS=certs/supabase-ca.crt

OTP_LENGTH=6
OTP_EXPIRY_SECONDS=300
OTP_RESEND_SECONDS=60
OTP_RATE_LIMIT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS

# Local development may leave this blank and use the single-process fallback.
# Production requires real shared Redis.
REDIS_URL=
```

- Get project URL and public/publishable or legacy anon key from the Supabase project's
  Connect/API settings. Do not put a secret or `service_role` key in the publishable field.
- URL-encode special characters in the database password. Never use the normal `postgres`
  administrator login for this API; readiness deliberately rejects privileged logins.
- Generate the OTP rate-limit secret locally, for example with `openssl rand -hex 32`.
- Existing `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` can remain in the old WhatsApp app.
  **No additional Twilio env keys are needed in this backend or Android app.**
- A deployed production backend additionally requires Redis, explicit HTTPS CORS origins,
  correct proxy trust and its production settings from `.env.example`.

Start the backend:

```bash
cd new
bun install --frozen-lockfile
cd backend
bun dev
```

Check `http://localhost:4000/health/live` and `/health/ready`. Both should return 200
before real testing. A 503 readiness response usually means missing settings, unapplied
SQL 046, an unsafe database login, missing grants or a database/TLS/Redis connection issue.

## 5. Connect Android

The Android app needs **only the Nest API base URL**, no Twilio or Supabase secret keys.
See [Android build/install instructions](../android/README.md).

- Android emulator → backend on this computer: `http://10.0.2.2:4000/`.
- USB phone: use `adb reverse tcp:4000 tcp:4000`, then `http://127.0.0.1:4000/`.
- Phone on the same Wi-Fi: `http://YOUR_COMPUTER_LAN_IP:4000/`; the backend must listen
  on `0.0.0.0` and your firewall must allow that local connection.
- Production uses an HTTPS API URL. Cleartext HTTP is development-only.

Then request an OTP, verify, enter a name if asked, and choose owner/staff. Plan selection,
shop creation and invitation acceptance are later backend phases, so the app must show
their current status without pretending those operations are available.

This first mobile build does not yet include Google OAuth entry or native CAPTCHA.
Use a private development project with suitable test settings; do not disable production
CAPTCHA protection. Existing Google-only owners must link their number while signed in
to the original account before using phone sign-in, rather than creating a second account.
