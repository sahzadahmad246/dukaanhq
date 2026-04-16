# Cashfree setup (DukaanHQ)

India-only **Cashfree PG (Payments Gateway)** credentials and a **webhook** pointing at your deployed app.

**Database / Supabase SQL** is documented in [`docs/DATABASE_MIGRATION.md`](./DATABASE_MIGRATION.md), not here.

## Environment variables (`.env.local` / hosting)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_APP_URL` | Yes | Public site URL, **no trailing slash**, e.g. `https://app.dukaanhq.com` |
| `CASHFREE_SECRET_KEY` | For webhooks | **Client Secret** from Cashfree (same secret used in SDK as `X-Client-Secret`). Used to verify `x-webhook-signature`. |
| `CASHFREE_APP_ID` | For future checkout API | **Client ID** / App ID from Cashfree dashboard (not used by the webhook route yet, but set it now for when you add checkout). |
| `SUPABASE_SERVICE_ROLE_KEY` | For webhooks | Service role key — webhooks update `shop_entitlements` with admin privileges. |
| `DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION` | Optional | Set to `true` **only in dev** to show “Dev: mark shop as subscribed” on `/subscribe`. |
| `SUPERADMIN_PROMOTE_EMAILS` | Optional | Comma-separated emails auto-promoted to `superadmin` on sign-in (needs service role). |

## Webhook URL

Register this in the Cashfree dashboard:

```text
{NEXT_PUBLIC_APP_URL}/api/webhooks/cashfree
```

Example: `https://app.dukaanhq.com/api/webhooks/cashfree`

## Getting API keys

1. Sign in to [Cashfree](https://www.cashfree.com/) and open the **merchant dashboard**.
2. Go to **Developers** → **API keys** (wording may vary slightly).
3. Copy **Client ID** (App ID) → `CASHFREE_APP_ID`.
4. Copy **Client Secret** → `CASHFREE_SECRET_KEY` (treat as password; never expose to the browser).
5. Under **Webhooks** / **PG webhooks**, add the URL above and enable subscription + payment events you need (at minimum: `SUBSCRIPTION_PAYMENT_SUCCESS`, `SUBSCRIPTION_STATUS_CHANGED`, and optionally `PAYMENT_SUCCESS_WEBHOOK` for one-time orders).

Official signature docs: [Webhook signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification).

## Linking Cashfree events to a shop

The webhook must know which **DukaanHQ `shop_id`** (UUID) to update. Supported mechanisms (first match wins):

1. **Subscription tags** — when creating a subscription in Cashfree, set `subscription_tags` / metadata so it includes:
   - `dukaanhq_shop_id`: `"<uuid>"`  
   or `shop_id` with the same UUID.
2. **Merchant subscription id** — use a subscription id like `dhq_<shop_uuid>` (example: `dhq_550e8400-e29b-41d4-a716-446655440000`).
3. **Existing row** — if `shop_entitlements.cashfree_subscription_id` already matches Cashfree’s `subscription_id`, the webhook resolves the shop from that.
4. **One-time payments** — for `PAYMENT_SUCCESS_WEBHOOK`, set `order_tags.dukaanhq_shop_id` on the order.

If none match, the endpoint still returns **200** but logs `shop_not_resolved` (so Cashfree does not retry forever).

## Quick test without Cashfree

1. Set `DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION=true`.
2. Open `/subscribe` as the **shop owner** and use **Dev: mark shop as subscribed**.

This only updates Supabase; it does not call Cashfree.

## What you still build next

- **Create subscription / checkout session** from `/subscribe` using Cashfree’s Subscription API, passing `dukaanhq_shop_id` in tags or `dhq_<uuid>` as subscription id.
- **Customer portal** link (if Cashfree provides one for your integration) from `/subscription`.
- **Stricter locking** (e.g. `past_due` state) once you confirm which webhooks you rely on for renewals and failures.
