# SaaS administration

The control centre is available at `/admin/saas`. Access requires an authenticated profile whose role is `superadmin`. Each data loader and mutation verifies that role before using an elevated database client; the layout is not the only access check.

## Screens

- **Overview**: exact platform counts, recent shops, subscription activity, suspended shops and past-due subscription counts.
- **Shops**: paginated directory with shop name/email/city search, shop-status and billing-status filters. Shop profiles have overview, invoices, inventory, customers, team and access sections. Shop details and logos can be edited.
- **Plans**: monthly/yearly prices, provider product references, discounts, trial days, listing status, usage limits, feature entitlements and pricing-page benefits for the supported Starter, Growth and Pro plans.
- **Subscriptions**: paginated access records with provider status, expiry/grace dates, manual extensions and access locks. Billing Health compares provider products with app prices and shows recorded subscription pricing; see [Dodo pricing verification](dodo-billing.md).
- **Reports**: 7/30/90 India-calendar-day tenant invoice totals, daily sales, per-shop breakdown and CSV export. Cancelled invoices are excluded from sales. Paid invoice value includes fully paid invoices only; partial-payment balances are not recorded by the existing schema. Reports page through all matching invoices rather than reporting only the first 1,000 records.
- **Support & operations**: payment issues, recent incomplete checkouts and a paginated provider event log. Events are read-only; this does not create a ticketing system or replay billing events.
- **Settings**: trial access policy, trial duration, legacy pricing defaults and service configuration presence. Presence checks do not assert service connectivity.

Shop sales are **not SaaS subscription revenue**. The existing schema has no complete payment ledger, so collected SaaS revenue is not inferred from current plan prices or shop invoice values.

## Management behavior

Manual access grants and plan overrides do not charge customers or change the payment provider's subscription. A provider renewal/webhook can replace a manual plan override. Extensions add days to the later of now and existing access dates. Expired access must be extended before unlocking. Locking workspace access does not cancel provider billing.

Shop suspension is enforced through the shop status in the shared workspace authorization flow. Restoring a shop preserves individually suspended staff. For shops suspended by the older RPC, owner memberships are recovered when the shop is restored; staff statuses remain unchanged because the historical reason for those suspensions was not recorded. Admin team controls modify staff memberships only and cannot suspend owners.

## Configuration and verification

Existing database migrations through the current subscription schema must be installed. These UI changes require no new database migration. Server-side `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE`) is required for cross-shop reads and management mutations. Missing configuration fails visibly instead of silently reporting zero records under tenant RLS. Service credentials are never sent to the browser.

Run `npm run test:admin`, `npx tsc --noEmit`, `npx eslint src/app/admin/saas src/lib/admin src/lib/auth/user-flow.ts`, and `npm run build`.

Tests cover role checks before privilege elevation, tenant/staff scoping, subscription extension and expiry behavior, legacy owner recovery, India date boundaries, cancellation handling, and report pagination. Browser fixture previews can verify layout but do not replace a signed-in staging check of database writes and provider state.
