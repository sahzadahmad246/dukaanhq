# Dodo pricing verification

## Source of truth and units

The app plan catalogue stores INR prices in paise. ₹499/month is **49,900 INR minor units**, not 499 or 5. Dodo recurring prices also use currency minor units. A subscription snapshot with `currency: "USD"` and `recurring_pre_tax_amount: 5` represents **US$0.05 before tax**, not ₹499.

References: [Dodo recurring price schema](https://github.com/dodopayments/dodopayments-typescript/blob/main/src/resources/products/products.ts), [subscription details](https://docs.dodopayments.com/api-reference/subscriptions/get-subscriptions), [plan changes](https://docs.dodopayments.com/api-reference/subscriptions/change-plan).

## Configuration

Configure these values securely in each environment. Test and live credentials and product IDs must belong to the same environment. Do not paste keys into chat or commit them.

- `DODO_PAYMENTS_API_KEY`: API key for the selected environment.
- `DODO_PAYMENTS_ENVIRONMENT`: exactly `test_mode` or `live_mode`. Production requires this explicitly; it no longer silently falls back to test mode.
- `DODO_PAYMENTS_WEBHOOK_SECRET` (or existing `DODO_PAYMENTS_WEBHOOK_KEY`): signing secret for the corresponding Dodo webhook endpoint.
- `NEXT_PUBLIC_APP_URL`: public application origin used for checkout return URLs.

The standard API host is selected from the environment. If an installation uses `DODO_PAYMENTS_API_BASE_URL`, its host must be configured for the same account/environment; do not use a test proxy for live credentials.

## Safeguards

Both checkout creation and scheduled plan changes fetch the referenced product first. The application refuses the POST if the product, recurrence, currency, effective price after product discounts, or billing frequency does not match the selected catalogue price. It also rejects regional pricing and paid trials because these checkout flows advertise fixed prices and free trials. Expired app discounts are excluded from the expected price. Provider read failures fail closed rather than creating an unverified checkout.

Saving an active plan with a configured Dodo product verifies the provider configuration before updating local plan details or prices. Saving an app price does not modify Dodo products or existing customer subscriptions.

`/admin/saas/subscriptions/health` shows live product checks and the latest stored recurring-price snapshot for existing subscriptions, including the recorded amount, currency, timestamp, and next billing date. Snapshot checks are historical evidence, not a live charge quote. Existing subscribers may legitimately retain an older price; review the customer agreement before repricing.

New subscription webhook events whose recorded pricing differs from the current app plan are marked `pricing_mismatch` in the operations queue. This is a review flag; it does not retroactively charge customers or automatically revoke access.

## Correcting an existing mispriced live subscription

1. Use matching live credentials to retrieve the current product and subscription. Stored events alone cannot confirm current provider state.
2. Verify that the intended Starter product is a monthly INR recurring product with a net base price of 49,900 paise. Confirm any discounts, trial, and tax treatment separately.
3. Correct the provider product configuration or create a correct recurring product, then update the app's product reference. The billing-health product check must pass before reopening checkout.
4. Correct the existing subscription separately after reviewing the agreed price and effective date. Billing Health offers **Schedule corrected renewal** only when the target product verifies correctly and the recorded subscription is active. The server rechecks live status, quantity, discounts, cancellation, and the next billing date, then schedules the verified current plan with `effective_at: next_billing_date` and `proration_billing_mode: do_not_bill`. It refuses cancelled/ending subscriptions and custom quantities, add-ons, or discounts. The local plan/access record is not prematurely changed; the provider schedule is logged for review. Changing the catalogue or product reference alone is not evidence that existing renewals were repriced. Use the provider's supported plan-change flow (or replacement subscription flow if required) and verify the result by retrieving the subscription again. Do not back-charge historical differences as part of a configuration fix.
5. Verify the next actual invoice and webhook, including amount, currency, frequency, and period. Keep any unrelated cancellations and customer-specific discounts intact.

No existing live customer, product, price, subscription, or charge was changed by the diagnostic work that introduced these safeguards.

## Tests

`npm run test:payments` checks minor-unit mistakes, cross-currency mismatches, wrong billing frequency, discounts and expiry, unsupported products, provider failures, explicit environment selection, and prevention of checkout/plan-change POSTs before successful validation. `npm run test:admin` also checks that a failed provider-price verification cannot mutate local plan details.
