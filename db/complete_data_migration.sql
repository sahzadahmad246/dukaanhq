-- DukaanHQ: SaaS billing tables, shop entitlements, superadmin policies, staff role rename,
-- RLS refresh (owner + staff), cancel_at_period_end, and legacy profile.role cleanup.
-- Run once in Supabase SQL Editor after base schema (e.g. db/001–025). Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- Part A — saas_platform_settings, shop_entitlements, entitlements RLS, superadmin shop read
-- ---------------------------------------------------------------------------

create table if not exists public.saas_platform_settings (
  id integer primary key default 1 check (id = 1),
  trial_enabled boolean not null default true,
  trial_duration_days integer not null default 30 check (trial_duration_days > 0 and trial_duration_days <= 365),
  plan_display_name text not null default 'DukaanHQ Pro',
  plan_price_paise bigint not null default 49900 check (plan_price_paise >= 0),
  plan_currency text not null default 'INR',
  updated_at timestamptz not null default now()
);

insert into public.saas_platform_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.shop_entitlements (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  billing_status text not null default 'trialing' check (billing_status in ('trialing', 'active', 'locked')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_valid_until timestamptz,
  cashfree_subscription_id text,
  cashfree_customer_id text,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_shop_entitlements_updated_at on public.shop_entitlements;
create trigger set_shop_entitlements_updated_at
before update on public.shop_entitlements
for each row execute function public.set_current_timestamp_updated_at();

alter table public.shop_entitlements
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.saas_platform_settings enable row level security;
alter table public.shop_entitlements enable row level security;

drop policy if exists "saas settings read authenticated" on public.saas_platform_settings;
create policy "saas settings read authenticated"
on public.saas_platform_settings
for select
to authenticated
using (true);

drop policy if exists "saas settings update superadmin" on public.saas_platform_settings;
create policy "saas settings update superadmin"
on public.saas_platform_settings
for update
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
);

drop policy if exists "shop members read entitlement" on public.shop_entitlements;
create policy "shop members read entitlement"
on public.shop_entitlements
for select
using (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id and m.user_id = auth.uid()
  )
);

drop policy if exists "owner inserts shop entitlement" on public.shop_entitlements;
create policy "owner inserts shop entitlement"
on public.shop_entitlements
for insert
with check (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id and m.user_id = auth.uid() and m.role = 'owner'
  )
);

drop policy if exists "superadmin all shop entitlements" on public.shop_entitlements;
create policy "superadmin all shop entitlements"
on public.shop_entitlements
for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "superadmin read all shops" on public.shops;
create policy "superadmin read all shops"
on public.shops
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
);

drop policy if exists "superadmin read shop members" on public.shop_members;
create policy "superadmin read shop members"
on public.shop_members
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
);

drop policy if exists "superadmin read shop settings" on public.shop_settings;
create policy "superadmin read shop settings"
on public.shop_settings
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'staff', 'owner', 'admin', 'superadmin'));

update public.shop_members set role = 'staff' where role = 'admin';
update public.shop_member_invitations set role = 'staff' where role = 'admin';

alter table public.shop_members drop constraint if exists shop_members_role_check;
alter table public.shop_members add constraint shop_members_role_check
  check (role in ('customer', 'staff', 'owner'));

alter table public.shop_member_invitations drop constraint if exists shop_member_invitations_role_check;
alter table public.shop_member_invitations add constraint shop_member_invitations_role_check
  check (role in ('owner', 'staff'));

-- Legacy: profile.role "admin" was used for shop operators; shop_members now uses "staff".
update public.profiles p
set role = 'staff'
where p.role = 'admin'
  and exists (select 1 from public.shop_members m where m.user_id = p.id and m.role = 'staff');

insert into public.shop_entitlements (shop_id, billing_status, trial_started_at, trial_ends_at, subscription_valid_until)
select s.id, 'active', null, null, null
from public.shops s
where not exists (select 1 from public.shop_entitlements e where e.shop_id = s.id);

-- ---------------------------------------------------------------------------
-- Part B — RLS policies: shop role "staff" instead of legacy "admin"
-- ---------------------------------------------------------------------------

-- --- db/004_inventory.sql (categories → stock_movements) ---
drop policy if exists "owners and admins can insert categories" on public.categories;
create policy "owners and admins can insert categories" on public.categories for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can update categories" on public.categories;
create policy "owners and admins can update categories" on public.categories for update using (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can insert brands" on public.brands;
create policy "owners and admins can insert brands" on public.brands for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can update brands" on public.brands;
create policy "owners and admins can update brands" on public.brands for update using (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can insert products" on public.products;
create policy "owners and admins can insert products" on public.products for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can update products" on public.products;
create policy "owners and admins can update products" on public.products for update using (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can insert product variants" on public.product_variants;
create policy "owners and admins can insert product variants" on public.product_variants for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can update product variants" on public.product_variants;
create policy "owners and admins can update product variants" on public.product_variants for update using (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can insert inventory items" on public.inventory_items;
create policy "owners and admins can insert inventory items" on public.inventory_items for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can update inventory items" on public.inventory_items;
create policy "owners and admins can update inventory items" on public.inventory_items for update using (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));
drop policy if exists "owners and admins can insert stock movements" on public.stock_movements;
create policy "owners and admins can insert stock movements" on public.stock_movements for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = stock_movements.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'staff')));

-- --- db/007 + db/008 + db/009 + db/017 product_images ---
drop policy if exists "owners and admins can insert product images" on public.product_images;
create policy "owners and admins can insert product images"
on public.product_images
for insert
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners and admins can delete product images" on public.product_images;
create policy "owners and admins can delete product images"
on public.product_images
for delete
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners and admins can delete products" on public.products;
create policy "owners and admins can delete products"
on public.products
for delete
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = products.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

-- --- db/010_billing.sql ---
drop policy if exists "owners and admins can manage customers" on public.customers;
create policy "owners and admins can manage customers" on public.customers
for all using (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = customers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = customers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners and admins can manage invoices" on public.invoices;
create policy "owners and admins can manage invoices" on public.invoices
for all using (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = invoices.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = invoices.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners and admins can manage invoice items" on public.invoice_items;
create policy "owners and admins can manage invoice items" on public.invoice_items
for all using (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = invoice_items.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1 from public.shop_members
    where shop_members.shop_id = invoice_items.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

-- --- db/015_product_catalog_foundation.sql (policies only) ---
drop policy if exists "owners and admins can manage product highlights" on public.product_highlights;
create policy "owners and admins can manage product highlights"
on public.product_highlights
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_highlights.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_highlights.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners and admins can manage inventory item identifiers" on public.inventory_item_identifiers;
create policy "owners and admins can manage inventory item identifiers"
on public.inventory_item_identifiers
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = inventory_item_identifiers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = inventory_item_identifiers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

-- --- db/018_invoice_number_counters.sql (counter policy) ---
drop policy if exists "owners and admins can manage shop invoice counters" on public.shop_invoice_counters;
create policy "owners and admins can manage shop invoice counters"
on public.shop_invoice_counters
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_invoice_counters.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_invoice_counters.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

-- --- db/021_qr_labels_and_payloads.sql (counter policy) ---
drop policy if exists "owners and admins can manage shop qr counters" on public.shop_qr_counters;
create policy "owners and admins can manage shop qr counters"
on public.shop_qr_counters
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_qr_counters.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_qr_counters.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

-- --- db/002_shop_onboarding.sql (shop + shop_settings updates) ---
drop policy if exists "owners can update own shops" on public.shops;
create policy "owners can update own shops"
on public.shops
for update
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shops.id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shops.id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
drop policy if exists "owners can update shop settings" on public.shop_settings;
create policy "owners can update shop settings"
on public.shop_settings
for update
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_settings.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
)
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_settings.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
