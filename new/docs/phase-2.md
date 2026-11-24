# Phase 2 — Phone OTP, accounts and sessions

Implemented and locally tested, 23 November 2026. This is backend code, not an Android
UI or completed shop-onboarding feature. Live SMS is not enabled yet. No production
data, schema, Twilio sender or Supabase provider setting was changed.

## Endpoints

All paths below start with `/api/v1/auth`. JSON DTOs reject unknown fields, including
caller-supplied user IDs, roles or membership permissions. Protected routes require
`Authorization: Bearer <access_token>`. Responses use `Cache-Control: no-store`.

- `POST /otp/request`: `{ "phone": "+919876543210", "captcha_token": "optional" }`.
  Returns 202 with generic `accepted`, `retry_after_seconds`, `otp_length` and
  `expires_in_seconds` fields. New/existing accounts get the same response. Channel
  is always SMS. No OTP code, account existence or provider payload is returned.
- `POST /otp/verify`: `{ "phone": "+919876543210", "token": "123456" }`.
  Returns 200 with `session` plus account bootstrap after provider verification.
  New phone-only profiles have NULL email, default customer role and no shop access.
  Missing names lead to `complete_profile`; existing profile information is preserved.
- `POST /session/refresh`: `{ "refresh_token": "..." }`. Returns 200 with **session
  only**. It performs no database/bootstrap query. Supabase rotates credentials;
  the API never automatically replays a timed-out refresh. Clients must save returned
  tokens together and serialize refresh operations. Supabase's configured reuse window
  governs transport retries; invalid/reused credentials require sign-in again.
- `POST /session/logout`: authenticated, no body. Returns 204 and revokes the current
  provider refresh session (`scope=local`), preserving other devices. Clear credentials
  on the device. As with Supabase JWT sessions, an already-issued access token can
  remain valid until expiry; logout does not claim immediate JWT invalidation.
- `GET /me`: authenticated current account, minimal membership, current access flags,
  approved intent ID when eligible, next action and permitted choices. Access decisions
  come from fresh database state, not caller headers or cached JWT profile metadata.
- `PATCH /profile`: authenticated `{ "full_name": "Shop owner" }`. Trims and validates
  a name of 1–80 characters without control characters. Updates provider name metadata
  for compatibility with the legacy web synchronizer, then the SQL profile. These are
  separate systems, so a partial failure must be retried; the name-only operation is
  idempotent and never grants a role.
- `PATCH /intent`: authenticated `{ "intent": "owner" }` or `staff`. Records intent
  only. Owner intent leads to plan selection; staff intent leads to invitation/joining.
  It cannot create a membership, approve a subscription or grant a platform role.
- `POST /phone/link/request`: authenticated phone/captcha payload, returns generic 202.
  Intended for an existing Google/email account with no verified phone. This is initial
  linking, not phone replacement/recovery. Never merge accounts by shop contact numbers.
- `POST /phone/link/verify`: authenticated phone/token payload. Requires an unexpired
  Redis challenge bound to the same user/session and the provider's current pending
  phone. Verifies `phone_change`, checks that returned user UUID is unchanged and the
  phone is confirmed, consumes the challenge and returns session plus bootstrap.

Bootstrap fields: `account`, `membership`, `access`, `approved_intent_id`, `next_action`
and `permitted_choices`. Next actions are `complete_profile`, `choose_role`,
`select_plan`, `shop_onboarding`, `workspace`, `account_suspended`, `manage_subscription`,
`join_staff` and `platform_admin`. The last value is derived only from an existing
trusted superadmin profile. An invitation acceptance endpoint and shop creation are
later phases. Staff cannot manage subscriptions or staff permissions simply because
the next screen concerns their shop.

Full generated request/response schemas: [openapi.json](openapi.json). Interactive
development docs: `/api/docs`. Browser cookie/CSRF handling belongs to the new admin's
same-origin session layer; these API routes currently authenticate bearer credentials
only. Android must store refresh credentials using platform-backed protection.

## Twilio: what already exists and what is needed

Read-only checks found:

- Existing `web/.env.local` has `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
  Account API checks confirmed that these credentials are valid. No values were logged.
- Two Twilio Messaging Services exist, but no owned SMS-capable phone numbers were
  returned and no SMS-capable phone sender was found in those services. This check
  does not certify other sender types, destination permissions or delivery approval.
- The existing Supabase project's public settings report **phone auth disabled**.

For the selected **Supabase Twilio Programmable Messaging SMS provider**, reuse the
Account SID (`AC...`) and Auth Token. Configure a suitable SMS sender and copy the
SMS Messaging Service SID (`MG...`) into Supabase Auth's Twilio provider settings.
Supabase's official guide also allows the sender phone number in that setting;
see [the easy setup guide](SMS_SETUP.md) for the simplest sender-number route.
The existing WhatsApp sender/templates do not establish SMS capability. A separate
Twilio API Key SID/Secret is not required by this chosen provider integration.

Twilio Verify is a different supported Supabase provider with a Verify Service SID
(`VA...`); do not mix its configuration with the Messaging Service SID above. This
implementation deliberately calls Supabase Auth rather than implementing a competing
OTP/session store or putting Twilio credentials into Android.

Configure and test on staging:

1. Configure the SMS sender/service in Twilio with the correct destination permissions
   and any required sender registrations. Use Twilio's guidance for target countries.
2. In Supabase Auth, enable Phone and configure the **Twilio** SMS provider with the
   existing Account SID/Auth Token and the SMS Messaging Service/sender settings.
   Keep SMS auto-confirm disabled and allow phone signups for the desired new-user flow.
3. Set OTP length/expiry/resend consistently with the API. Defaults are six digits,
   300 seconds and 60 seconds. The API reports configured timing; Supabase enforces
   the actual code lifetime. Enable provider rate limits, destination controls and
   configured CAPTCHA protection; the public Supabase Auth endpoint must also be
   protected, since API-side throttles do not cover direct calls to that endpoint.
4. Begin with configured Supabase test phone numbers/fixed codes, then verify actual
   SMS delivery to an authorized test number and existing-account phone linking.
   No SMS was sent during this implementation and no fixed-code bypass exists in API code.

References: [Supabase phone login](https://supabase.com/docs/guides/auth/phone-login),
[Twilio Messaging Services](https://www.twilio.com/docs/messaging/services),
[Twilio request authentication](https://www.twilio.com/docs/usage/requests-to-twilio),
[Supabase refresh/session behavior](https://supabase.com/docs/guides/auth/sessions),
[Supabase Twilio provider implementation](https://github.com/supabase/auth/blob/master/internal/api/sms_provider/twilio.go).

## Database and runtime rollout

The new API has no local direct database URL/Redis deployment configured. The Android
setup prepared an ignored `.env` with existing public project settings and a random
rate secret while leaving auth off. Follow [the easy setup guide](SMS_SETUP.md).
Liveness/docs work and readiness stays at 503 until configuration is finished.

1. Review [SQL 046](../../web/db/046_mobile_phone_auth.sql) and apply to a staging copy
   of the current schema. It makes profile email nullable without removing email
   uniqueness, adds nullable owner/staff intent, and adds a trigger preventing public
   authenticated sessions from assigning admin/superadmin roles. Trusted provisioning
   and existing profile IDs/emails/roles are preserved. Other business tables are unchanged.
2. Provision/review the limited database login described in the backend README.
   Set `DATABASE_URL`, TLS and bounded pool settings plus shared `REDIS_URL`.
   Do not run as an owner/superuser or use a transaction-mode pooler without testing.
3. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (existing public/anon key is compatible),
   `AUTH_ENABLED=true`, OTP settings and a random shared `OTP_RATE_LIMIT_SECRET` of
   at least 32 characters. Secret/service-role API keys are rejected in that key field.
   Twilio credentials remain in Supabase's provider configuration, not this API env.
4. Verify `/health/ready`, real phone flows, Google-account linking, grants/RLS and
   token rotation on staging before any production rollout. Neither API deployment
   nor migrations are automated by this work. If stopping the rollout, disable the
   new API; do not invent emails to force phone-only rows back into a NOT NULL schema.

## Limits, isolation and performance

- Default resend cooldown: 60 seconds. Per phone: ten send attempts/day, five verification
  attempts/ten minutes and twenty verification attempts/day. Per IP: twenty sends/hour,
  one hundred/day; sixty verifications/ten minutes and five hundred/day. Route limits
  also apply. Request/verification limits are shared across login and linking.
- Phone/IP/session keys use HMAC; Redis does not store raw phone numbers, OTPs or tokens.
  Only public JWKS signing keys are cached. Redis outages fail closed with 503.
- Transactions execute `SET LOCAL ROLE authenticated` and parameterized verified user
  claims, so existing `auth.uid()` RLS remains effective. COMMIT/ROLLBACK resets state;
  failed pooled connections are discarded. No user token is installed on a shared SDK.
- Existing-profile `/me` uses one bounded data projection, no profile write: five SQL
  commands including BEGIN, role, claims and COMMIT. A missing profile is inserted once
  and reread. Membership lookup is capped at two to detect incompatible multiple shops.
  No whole inventory, invoice history or subscription payload is loaded for sign-in.
- Fresh access checks preserve shop/member suspension, completed onboarding, paid expiry,
  grace periods, trial disable/expiry and staff/owner distinctions. Missing entitlements
  do not grant workspace access. No actual shop workflow speedup is claimed yet;
  authenticated representative staging baselines remain open from Phase 1.

## Verified locally

56 tests passed with zero skips using temporary Redis 8.12.0 and Node 24.22.3.
Formatting, lint, type checks, production compilation and OpenAPI generation passed.
Tests use SMS/provider mocks, real signed JWTs/local JWKS, and disposable PostgreSQL
fixtures. The real SQL 046 was applied only to test fixtures. Supporting shop tables
use a minimal RLS read model; full legacy migration/service integration is still a
staging acceptance requirement.

Coverage includes new/existing accounts, invalid/expired codes, malformed phone numbers,
resend/verification limits, provider outages, JWT signatures/expiry/issuer/audience,
public-key caching, legacy verification fallback, refresh isolation/retries/logout,
name completion, intent without promotion, same-session linking and wrong-user rejection,
shared Redis challenge expiry, SQL rollback, cross-user RLS, NULL-email uniqueness and
blocking direct platform-role self-promotion.
