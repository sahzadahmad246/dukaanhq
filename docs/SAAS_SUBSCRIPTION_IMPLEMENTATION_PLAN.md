# DukaanHQ SaaS subscription implementation plan

This plan describes how DukaanHQ should move from public pricing + plan management to a real SaaS subscription system with Cashfree recurring payments, trial eligibility, plan entitlements, warnings, and access lockout.

## What we are building

Customer flow:

1. A visitor opens `/pricing`.
2. They choose Starter, Growth, or Pro.
3. If they are not signed in, they continue with Google login.
4. After login, they are sent to a pre-onboarding subscription gate, not shop onboarding.
5. The selected plan and billing interval are preserved in a pending signup record/cookie.
6. If they choose Starter and are eligible, start a 7-day trial before creating the shop.
7. If they choose paid activation, create a Cashfree subscription mandate/recurring payment setup before creating the shop.
8. User completes Cashfree authorization/payment.
9. Webhook + server verification confirms the subscription.
10. Only after trial/subscription approval, allow onboarding and create the shop.
11. During onboarding completion, attach the approved pending subscription/trial to the newly created shop.
12. DukaanHQ creates/updates local subscription records and entitlements.
13. App features are allowed/blocked based on the subscribed plan.
14. Before expiry/renewal, users see clear warnings.
15. After expiry/payment failure/cancellation, access is limited until renewal.

## Core rule: subscribe before onboarding

Do not create a real `shops` row before trial/subscription approval.

Reason:

- If people can create a shop before subscribing, the database fills with unused shops, products, onboarding drafts, settings, and member rows.
- Payment/trial approval should happen first.
- Onboarding should happen only after the user has a valid pending trial or paid subscription.

Recommended flow:

1. User chooses plan on `/pricing`.
2. App stores lightweight pending intent:
   - `owner_user_id`
   - `owner_email`
   - `plan_id`
   - `price_id`
   - `billing_interval`
   - `status`
   - `expires_at`
3. Starter trial or Cashfree payment/authorization is approved.
4. Pending signup becomes `approved`.
5. User is allowed into `/onboarding`.
6. Onboarding creates the real shop.
7. App converts pending signup into `shop_subscriptions` + `shop_entitlements`.
8. Pending signup is marked `completed`.

This keeps the database clean. Abandoned pricing/login/payment attempts expire automatically and never create a shop.

## Core rule: paid subscription belongs to user before shop exists

Because payment happens before onboarding, the first subscription owner is the signed-in user, not the shop.

If the user pays and disappears before creating a shop:

- Do not ask them to pay again when they come back.
- Keep the paid subscription attached to `owner_user_id` / `owner_email`.
- The paid period starts from the payment/mandate activation date, even if the shop is not created yet.
- When they return, send them to onboarding with a message like:
  - "Your Growth subscription is active. Finish shop setup to start using DukaanHQ."
- After onboarding creates the shop, move/link the subscription data to that shop.

This means `subscription_intents` is not just a short checkout helper. For paid users without a shop, it is the temporary owner of a real paid subscription.

Recommended states for this pre-shop period:

- `payment_pending`: Cashfree flow started, not approved yet.
- `payment_approved`: payment/mandate approved, but shop not created yet.
- `trial_approved`: Starter trial approved, but shop not created yet.
- `completed`: shop created and subscription moved/linked to shop.

Important:

- `payment_approved` intents should not expire like abandoned selected intents.
- `selected` and stale `payment_pending` intents can expire.
- `payment_approved` remains until onboarding is completed, cancelled, refunded, or manually handled by superadmin.
- If the current paid period ends before the user creates a shop, they should be asked to renew, not given a fresh free period.

## Important product decisions

### Trial

Starter gets a 7-day free trial only once.

Do not trust only the current `shop_entitlements.trial_started_at` row for this. We need permanent trial history so a user cannot delete/recreate a shop and claim trial repeatedly.

Recommended rule:

- Trial eligibility is checked by owner user id and possibly email.
- A user can have only one Starter trial ever.
- A shop can have only one trial ever after it is created.
- Superadmin can manually grant/extend trial if needed.

### Trial vs paid subscription

Starter trial should not require payment mandate in phase one unless you want auto-conversion.

Two possible models:

1. **Simple trial first**
   - User starts Starter trial without Cashfree mandate.
   - After 7 days, lock app and ask them to subscribe.
   - Easiest to implement and least friction.

2. **Trial with mandate**
   - User authorizes Cashfree first.
   - First charge happens after 7 days.
   - Better for conversion, but more complex and must be carefully worded.

Recommended for DukaanHQ now: start with **simple trial first**, then add mandate-before-trial later if needed.

### Plan access

The app should not hardcode `starter`, `growth`, `pro` everywhere. It should load the active shop subscription, then load plan `limits` and `entitlements`.

Example checks:

- Can create product? `products_count < plan.limits.products`, unless unlimited.
- Can create invoice? current month invoice count below `plan.limits.invoices_per_month`, unless unlimited.
- Can invite staff? `plan.entitlements.staff_access === true`.
- Can render signature/stamp in PDF? `customer_signature` and `shop_stamp`.
- Can send WhatsApp invoice? `whatsapp_invoice_sending`.
- Can auto-send EMI reminders? `auto_emi_reminders`.

## Recommended database design

We already have:

- `saas_plans`
- `saas_plan_prices`
- `shop_entitlements`

Add these tables/columns in the subscription phase.

### `subscription_intents`

Pre-onboarding subscription record. This is created before a shop exists.

For unpaid/abandoned users, it is lightweight and may expire.

For paid users, it stores the user-level subscription until a shop is created.

Columns:

- `id uuid primary key`
- `owner_user_id uuid references profiles(id)`
- `owner_email text not null`
- `plan_id uuid references saas_plans(id)`
- `price_id uuid references saas_plan_prices(id)`
- `plan_code text not null`
- `billing_interval text not null`
- `status text`
  - `selected`
  - `trial_approved`
  - `payment_pending`
  - `payment_approved`
  - `expired`
  - `completed`
  - `cancelled`
- `trial_started_at timestamptz`
- `trial_ends_at timestamptz`
- `cashfree_subscription_id text`
- `cashfree_cf_subscription_id text`
- `cashfree_subscription_session_id text`
- `cashfree_customer_id text`
- `cashfree_authorization_status text`
- `cashfree_payment_method text`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `next_payment_at timestamptz`
- `last_payment_at timestamptz`
- `last_payment_status text`
- `expires_at timestamptz not null`
- `created_shop_id uuid references shops(id)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:

- `owner_user_id, status`
- `expires_at`
- `cashfree_subscription_id`

Cleanup:

- Expire old `selected` / `payment_pending` intents after a short period, for example 24 hours.
- Do not expire `payment_approved` just because onboarding is incomplete.
- Do not expire `trial_approved` until the trial end date passes.
- These records are tiny and safe to keep for analytics/debugging.

### `shop_subscriptions`

One row per shop's current subscription state. This is created after onboarding creates the shop, by converting an approved `subscription_intents` record.

Columns:

- `id uuid primary key`
- `shop_id uuid not null references shops(id)`
- `owner_user_id uuid not null references profiles(id)`
- `plan_id uuid references saas_plans(id)`
- `price_id uuid references saas_plan_prices(id)`
- `status text`
  - `trialing`
  - `pending_authorization`
  - `active`
  - `past_due`
  - `cancel_at_period_end`
  - `cancelled`
  - `expired`
  - `locked`
- `billing_interval text`
  - `month`
  - `year`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `trial_started_at timestamptz`
- `trial_ends_at timestamptz`
- `cancel_at_period_end boolean`
- `cancelled_at timestamptz`
- `cashfree_subscription_id text`
- `cashfree_cf_subscription_id text`
- `cashfree_customer_id text`
- `cashfree_subscription_session_id text`
- `cashfree_authorization_status text`
- `cashfree_payment_method text`
- `next_payment_at timestamptz`
- `last_payment_at timestamptz`
- `last_payment_status text`
- `last_webhook_event_at timestamptz`
- `source_intent_id uuid references subscription_intents(id)`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique:

- `unique(shop_id)` for one current subscription per shop.
- `unique(cashfree_subscription_id)` when not null.

### `subscription_events`

Immutable audit log for everything subscription-related.

Columns:

- `id uuid primary key`
- `shop_id uuid`
- `subscription_intent_id uuid`
- `subscription_id uuid`
- `provider text`
- `event_type text`
- `provider_event_id text`
- `payload jsonb`
- `processed_status text`
- `processed_message text`
- `created_at timestamptz`

Use this to debug Cashfree webhooks and avoid duplicate processing.

### `trial_grants`

Permanent trial history.

Columns:

- `id uuid primary key`
- `owner_user_id uuid`
- `owner_email text`
- `shop_id uuid`
- `subscription_intent_id uuid`
- `plan_code text`
- `trial_started_at timestamptz`
- `trial_ends_at timestamptz`
- `source text`
  - `self_serve`
  - `superadmin`
- `created_at timestamptz`

Unique:

- `unique(owner_user_id, plan_code)` for self-serve trials.
- `unique(shop_id, plan_code)`.

### `shop_entitlements`

Keep this table as the fast app-access table, but extend it or mirror subscription values into it.

Recommended extra columns:

- `plan_id uuid`
- `subscription_id uuid`
- `access_expires_at timestamptz`
- `grace_ends_at timestamptz`
- `locked_reason text`

`shop_entitlements` should be easy for app screens to read quickly. `shop_subscriptions` is the billing source of truth.

## Cashfree setup

Use the latest Cashfree Subscription APIs unless Cashfree support tells us your account only supports the older v2 subscription flow.

From current Cashfree docs:

- Sandbox base URL: `https://sandbox.cashfree.com/pg`
- Production base URL: `https://api.cashfree.com/pg`
- Latest API version: `2025-01-01`
- Create subscription endpoint: `POST /subscriptions`
- Fetch subscription endpoint: `GET /subscriptions/{subscription_id}`
- Manage subscription endpoint: `POST /subscriptions/{subscription_id}/manage`
- Fetch subscription payments endpoint: `GET /subscriptions/{subscription_id}/payments`

Required request headers:

- `x-api-version: 2025-01-01`
- `x-client-id: <CASHFREE_APP_ID>`
- `x-client-secret: <CASHFREE_SECRET_KEY>`
- `x-idempotency-key: <uuid>` for create/retry safety
- `x-request-id: <uuid>` for debugging

### SDK vs direct API

We can use Cashfree's official SDK where it cleanly supports the operation we need, but we should not depend on the SDK blindly for subscriptions.

Current finding:

- Cashfree has an official Node package, `cashfree-pg`.
- The Node SDK is useful for common PG operations and webhook signature helpers.
- The latest Cashfree Subscription APIs are documented primarily as REST endpoints under `/pg/subscriptions`.
- The public Node SDK package docs list common resources like orders, payments, refunds, payment links, settlements, and reconciliation, but subscriptions may not be exposed in the SDK in the same complete way as the latest REST docs.

Recommended approach:

1. Use a server-only `cashfreeClient` wrapper in our app.
2. Inside that wrapper, use the official SDK only if the installed SDK version exposes the exact latest subscription methods we need.
3. Otherwise use direct `fetch` calls to Cashfree's official REST endpoints.
4. Keep the rest of the app calling our wrapper, not raw Cashfree APIs.

This gives us the best of both worlds:

- If SDK support is complete, implementation can use SDK methods.
- If subscription SDK support is incomplete or behind the docs, we still ship using Cashfree's official REST API.
- Switching later is easy because only `cashfreeClient` changes.

Do not call Cashfree directly from client components. All Cashfree secret/API calls must stay server-side only.

### Environment variables

Add/confirm:

```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
CASHFREE_ENV=sandbox
CASHFREE_API_VERSION=2025-01-01
CASHFREE_APP_ID=your_client_id
CASHFREE_SECRET_KEY=your_client_secret
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Optional:

```env
DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION=true
```

Only use `DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION` locally.

### Cashfree dashboard setup

1. Create or open your Cashfree merchant account.
2. Use sandbox fist.
3. Go to Developers / API keys.
4. Copy Client ID into `CASHFREE_APP_ID`.
5. Copy Client Secret into `CASHFREE_SECRET_KEY`.
6. Add subscription webhook endpoint:

```text
{NEXT_PUBLIC_APP_URL}/api/webhooks/cashfree
```

7. Use webhook API version `2025-01-01`.
8. Enable these events:
   - `SUBSCRIPTION_AUTH_STATUS`
   - `SUBSCRIPTION_STATUS_CHANGED`
   - `SUBSCRIPTION_PAYMENT_SUCCESS`
   - `SUBSCRIPTION_PAYMENT_FAILED`
   - `SUBSCRIPTION_PAYMENT_CANCELLED`
   - `SUBSCRIPTION_REFUND_STATUS`
   - `SUBSCRIPTION_CARD_EXPIRY_REMINDER`
9. Production webhooks must be HTTPS.
10. Keep webhook signature verification enabled in code.

## Cashfree subscription creation

When creating a paid subscription:

1. Generate local `subscription_intents` row with `payment_pending`.
2. Generate Cashfree `subscription_id`, for example:

```text
dhq_intent_{intent_uuid_short}_{plan_code}
```

3. Call Cashfree `POST /subscriptions`.
4. Include:
   - `subscription_id`
   - customer name/email/phone
   - plan details from `saas_plan_prices`
   - `subscription_meta.return_url`
   - `subscription_tags.dukaanhq_intent_id`
   - `subscription_tags.dukaanhq_owner_user_id`
   - `subscription_tags.dukaanhq_plan_code`
   - `subscription_tags.dukaanhq_price_id`
5. Store returned:
   - `subscription_session_id`
   - `cf_subscription_id`
   - `subscription_status`
   - `next_schedule_date`
6. Redirect/open Cashfree authorization using the session/link provided by Cashfree for the subscription flow.
7. When Cashfree confirms payment/authorization, update `subscription_intents` to `payment_approved`.
8. Set `current_period_start` from the payment/authorization time.
9. Set `current_period_end` / `next_payment_at` from Cashfree subscription/payment details.
10. Let the user continue to onboarding without paying again.

Important: Cashfree docs show `subscription_session_id` in the create response. During implementation, confirm whether your account requires Cashfree JS checkout, a hosted authorization URL, or another redirect method for this latest subscription API. This can differ by product/account configuration.

## Returning user before shop creation

When a signed-in user opens the app:

1. Check whether they have a completed shop membership.
2. If not, look for latest `subscription_intents` for their `owner_user_id`.
3. If `payment_approved` and `current_period_end` is in the future:
   - show "subscription active, finish onboarding"
   - send to `/onboarding`
   - do not ask for payment again
4. If `trial_approved` and `trial_ends_at` is in the future:
   - show "trial active, finish onboarding"
   - send to `/onboarding`
5. If paid period/trial expired before onboarding:
   - send to pricing/renew page
   - do not grant a new trial automatically
6. If only `selected` or stale `payment_pending` exists:
   - resume checkout if still valid
   - otherwise send to `/pricing`

When onboarding is submitted:

1. Create shop.
2. Create owner membership.
3. Create `shop_subscriptions` from approved intent.
4. Create `shop_entitlements` from approved intent + selected plan.
5. Set `subscription_intents.created_shop_id`.
6. Set `subscription_intents.status = completed`.

## Webhook handling

Current webhook code verifies Cashfree signatures and updates `shop_entitlements`. We should upgrade it to:

1. Verify signature.
2. Store raw payload in `subscription_events`.
3. Resolve `subscription_intent_id` or `shop_id` from:
   - `subscription_tags.dukaanhq_intent_id`
   - `subscription_tags.dukaanhq_shop_id` for already-onboarded shops
   - local `cashfree_subscription_id`
   - merchant subscription id
4. Fetch subscription from Cashfree for important events before activating access.
5. If shop does not exist yet, update `subscription_intents`.
6. If shop exists, update `shop_subscriptions`.
7. Mirror access into `shop_entitlements` only after shop exists.
8. Return HTTP 200 for handled/known events.

### Event mapping

`SUBSCRIPTION_AUTH_STATUS`

- If authorization succeeds, mark mandate authorized.
- If the plan has immediate charge, wait for payment success before full activation.
- If the plan starts after trial/first charge date, mark as `active` or `trialing` depending on selected model.

`SUBSCRIPTION_STATUS_CHANGED`

- `ACTIVE`: subscription active.
- `ON_HOLD`: set `past_due` or warning state.
- `CUSTOMER_CANCELLED` / `CANCELLED`: set `cancel_at_period_end` or cancelled depending Cashfree dates.
- `EXPIRED`: lock access.
- `CARD_EXPIRED`: warn user and request payment method update.

`SUBSCRIPTION_PAYMENT_SUCCESS`

- Set `active`.
- Update `current_period_start`, `current_period_end`, `last_payment_at`, `next_payment_at`.
- Unlock app access.

`SUBSCRIPTION_PAYMENT_FAILED`

- Set `past_due`.
- Start grace period, for example 3 days.
- Show payment failed warning.
- Lock after grace expires.

`SUBSCRIPTION_PAYMENT_CANCELLED`

- Mark cancelled/payment cancelled.
- Lock or grace depending event details.

`SUBSCRIPTION_CARD_EXPIRY_REMINDER`

- Show warning in app and subscription page.

## User experience states

### Active trial

Show:

- Trial active
- Trial ends on date
- Button: upgrade/subscribe

Access:

- Starter entitlements only.

### Trial expiring soon

When 2 days or less remain:

- Show banner in dashboard.
- Text: "Your Starter trial ends on {date}. Subscribe to keep billing and inventory active."

### Trial expired

Access:

- Lock workspace actions.
- Allow owner to view subscription/pricing pages.
- Staff should see "shop subscription expired, contact owner."

### Active paid subscription

Show:

- Plan name
- Billing interval
- Current period end / next payment date
- Payment method if Cashfree returns safe display info
- Button: manage/cancel/change plan

### Payment failed / past due

Show:

- Payment failed
- Grace ends on date
- Retry/update payment button

Access:

- During grace: allow use with warning.
- After grace: lock workspace.

### Cancel at period end

Show:

- "Your plan is active until {date}. Renewal is cancelled."
- Button: resume subscription.

Access:

- Allow until period end.
- Lock after period end.

## Feature enforcement plan

Implement entitlements in layers.

### Server-side enforcement

All important limits must be checked in server actions and route handlers.

Examples:

- `createProductAction`: check product count limit.
- `createInvoiceAction`: check monthly invoice count limit.
- `inviteStaffAction`: require `staff_access`, then check staff seat limit.
- WhatsApp send action: require `whatsapp_invoice_sending`.
- EMI reminder cron: require `auto_emi_reminders`.

### UI enforcement

UI should hide or disable unavailable features, but server-side checks remain required.

Examples:

- Starter PDF should not render customer signature or shop stamp.
- Starter settings should hide/disable shop stamp upload or mark it as Growth/Pro.
- Starter staff screen should show upgrade message.
- Starter public shop page should show upgrade message.

## Implementation phases

### Phase 1: Data model

- Add `subscription_intents`.
- Add `shop_subscriptions`.
- Add `subscription_events`.
- Add `trial_grants`.
- Extend `shop_entitlements`.
- Add RLS policies for owner/staff/superadmin.

### Phase 2: Selected plan and pre-onboarding gate

- Pricing CTA passes `plan` and `billing`.
- Login stores selected plan in cookie.
- After login, create or resume a `subscription_intents` row.
- Block `/onboarding` unless the user has an approved trial/payment intent.
- Approved intent is required before any real shop row is created.
- If user returns later with `payment_approved`, resume onboarding without asking for payment again.
- Paid subscription time starts from payment approval, not from shop creation.

### Phase 3: Starter trial

- Add "start trial" server action.
- Check `trial_grants`.
- Create `subscription_intents` as `trial_approved`.
- Allow onboarding.
- On onboarding submit, create shop, then create `shop_subscriptions` as `trialing`.
- Create/update `shop_entitlements`.
- Grant Starter entitlements for 7 days from trial approval.

### Phase 4: Cashfree client

- Add server-only Cashfree API helper.
- Create subscription API route/action.
- Store pending `subscription_intents` row.
- Redirect/open Cashfree authorization.
- Fetch subscription after return.
- Allow onboarding only after Cashfree approval is verified.
- Store user-level paid subscription details in `subscription_intents` if shop does not exist yet.
- Convert the approved intent into `shop_subscriptions` only after onboarding creates the shop.

### Phase 5: Webhooks

- Upgrade webhook handler to store events.
- Verify Cashfree status by fetching subscription/payment.
- Update `shop_subscriptions`.
- Mirror into `shop_entitlements`.
- Handle duplicate events idempotently.

### Phase 6: Subscription pages

- Update `/subscribe`.
- Update `/subscription`.
- Add plan upgrade/change/cancel/resume actions.
- Show trial/past-due/cancel state.

### Phase 7: Entitlement enforcement

- Inventory product limits.
- Invoice monthly limits.
- Staff seats.
- PDF signature/stamp gating.
- Public shop page gating.
- WhatsApp invoice gating.
- EMI reminder gating.

### Phase 8: Admin controls

- Superadmin view all subscriptions.
- Manual extend trial.
- Manual lock/unlock.
- Change shop plan.
- View Cashfree references and webhook events.

## Recommended first implementation slice

Start with Phase 1 to Phase 3:

1. Data model.
2. Keep selected plan from pricing to a pre-onboarding subscription gate.
3. Block onboarding until Starter trial is approved.
4. On onboarding submit, convert approved intent into shop subscription and entitlements.
5. Enforce Starter product/invoice/staff/PDF limits.

Then add Cashfree in the next slice. This avoids mixing payment debugging with core entitlement logic.

## Open questions before coding Cashfree

1. Do we require mandate before the 7-day Starter trial, or trial first and payment later?
2. Does your Cashfree account expose latest `2025-01-01` Subscription APIs?
3. Which authorization methods do you want to support first: UPI Autopay, card, eNACH, or all Cashfree-supported methods?
4. Should Growth/Pro start only after successful mandate authorization, or after first successful payment?
5. What grace period after payment failure: 0, 3, or 7 days?
6. Should staff be allowed read-only access after subscription expiry, or no workspace access at all?

## Sources checked

- Cashfree Subscription API overview: https://www.cashfree.com/docs/api-reference/payments/latest/subscription/overview
- Cashfree Create Subscription API: https://www.cashfree.com/docs/api-reference/payments/latest/subscription/mandate/create
- Cashfree Fetch Subscription API: https://www.cashfree.com/docs/api-reference/payments/latest/subscription/mandate/fetch
- Cashfree Manage Subscription API: https://www.cashfree.com/docs/api-reference/payments/latest/subscription/mandate/manage
- Cashfree Subscription Webhooks guide: https://www.cashfree.com/docs/payments/subscription/webhooks
- Cashfree Subscription webhook events: https://www.cashfree.com/docs/api-reference/payments/latest/subscription/webhooks
