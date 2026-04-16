# Database migration (Supabase)

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
