# Database migration (Supabase)

## Complete invoice history

Run **`db/045_invoice_history_pagination.sql`** after 043/044 before deploying
the bill-history update. It adds a read-only, shop-scoped function and indexes
for loading 30 bills at a time. Both regular and used-phone Bills screens load
the next batch while scrolling, with a manual Load more / retry option.
There is no all-time history cap. Search includes older bills, product names,
variants and IMEIs; totals cover the entire selected filter. Date filters use India time.
Stable date-and-ID cursors prevent newer inserts or deletions from shifting the next batch.
Used phone bills are labelled in the preview, details and PDF; the sale picker
contains available used stock only. Existing stored PDFs for used bills are
regenerated on download so they receive the label too.

## Second-hand phones

Before deploying the second-hand phones feature, run **`db/043_second_hand_phones.sql`**
in the Supabase SQL Editor on a database with the existing inventory/billing migrations through 042.
It adds catalogue and invoice labels, private seller purchase records, a private
`second-hand-invoices` Storage bucket (PDF/JPG/PNG/WebP, 5 MB maximum), and atomic
purchase / sale functions. It preserves current stock and invoices as regular inventory.
The migration is transactional and can be run again safely.

Also run **`db/044_second_hand_seller_phone_validation.sql`** after 043, including
on databases where 043 was already applied. It enforces a dial code followed by
exactly ten seller-phone digits on new purchase records, without rewriting older records.

The owner’s **Used Phones** navigation tab contains Stock and Bills. Record the
seller’s name and phone, purchase source/date, brand/model, RAM/storage, colour,
IMEI(s), purchase price and selling price. The seller phone uses a country-code
selector and exactly ten digits. Purchase source and brand support dropdowns and
manual entry; RAM/storage uses the same brand-aware presets as new products.
Both IMEIs support scanning and accept exactly fifteen digits. The original purchase invoice is optional.
Each phone is an individual stock unit, even when multiple phones share the same model.
Buyer bills use the existing invoice format and numbering sequence, and omit seller details.
Deleting a bill with restock restores that phone; its seller purchase record is retained.
Second-hand stock and bills count toward the existing product and invoice plan limits.

Run `bun run test:second-hand` for form/action checks and PostgreSQL integration tests.
The latter use PGlite locally with Supabase auth and Storage table stubs; they do not
connect to or change your Supabase project. They cover RLS, migration repeatability,
duplicate IMEIs, atomic purchases, separate billing, double-sale prevention and restocking.

## SaaS subscriptions, entitlements, and staff role

Use a **single** SQL bundle so you do not have to run numbered fragments in order.

### What to run

1. Complete your base schema first (see `SETUP.md` — e.g. `db/001_profiles.sql`, `db/002_shop_onboarding.sql`, and any later numbered files you already use).
2. In the Supabase **SQL Editor**, paste and run the full contents of:

   **`db/complete_data_migration.sql`**

That file is **idempotent** (safe to run more than once). It includes everything that used to be split across:

- `db/026_subscriptions_entitlements.sql` (now a pointer only)
- `db/027_staff_role_rls_refresh.sql` (now a pointer only)
- `db/028_shop_entitlements_cancel_flag.sql` (now a pointer only)

### Already applied 026 / 027 / 028?

If you already ran those older files on a database, you do **not** have to run `complete_data_migration.sql` again unless you want to re-apply idempotent policy/constraint updates. If something is still missing (for example `cancel_at_period_end`), running `complete_data_migration.sql` once will add it.

### What the bundle does (summary)

- Creates `saas_platform_settings` and `shop_entitlements` (with `cancel_at_period_end`), RLS for billing tables, and superadmin read access where needed.
- Extends `profiles.role` to allow `superadmin` (and keeps legacy `admin` in the check for backward compatibility).
- Renames shop operator role in data: `shop_members` / `shop_member_invitations` from `admin` → `staff`, updates check constraints.
- Sets `profiles.role` from legacy `admin` to `staff` when the user is a **staff** member in `shop_members` (aligns UI with shop role).
- Inserts default `shop_entitlements` rows for shops that do not have one yet (`billing_status = active`, no trial — your app or manual SQL can switch to trialing).
- Refreshes RLS policies across inventory, billing, catalog, counters, and shop settings so they allow `owner` and **`staff`** (replacing old `admin` checks).

### Optional: trial windows for existing shops

Adjust intervals and filters as needed.

**All shops** that already have an entitlement row:

```sql
UPDATE public.shop_entitlements
SET
  billing_status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '365 days',
  cancel_at_period_end = false,
  updated_at = now();
```

**Only specific shops** (by slug):

```sql
UPDATE public.shop_entitlements e
SET
  billing_status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '365 days',
  cancel_at_period_end = false,
  updated_at = now()
FROM public.shops s
WHERE e.shop_id = s.id
  AND s.slug IN ('your-shop-slug', 'another-shop');
```

**Only rows currently `active`** (optional):

```sql
UPDATE public.shop_entitlements
SET
  billing_status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '365 days',
  updated_at = now()
WHERE billing_status = 'active';
```

### Cashfree keys and webhooks

That is documented separately in **`docs/CASHFREE_SETUP.md`** (no SQL there).
