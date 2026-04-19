-- Superadmin: read access across tenants for admin dashboard.
-- If these policies aren't present, the /admin/saas dashboard will show 0 shops
-- because normal RLS only allows shop members to view their own shop data.

-- Helper predicate (inline in policies) is:
--   exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin')

-- Shops
drop policy if exists "superadmin read all shops" on public.shops;
create policy "superadmin read all shops"
on public.shops
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- Shop members
drop policy if exists "superadmin read shop members" on public.shop_members;
create policy "superadmin read shop members"
on public.shop_members
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- Shop settings
drop policy if exists "superadmin read shop settings" on public.shop_settings;
create policy "superadmin read shop settings"
on public.shop_settings
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- Inventory: products (needed for counts on shop detail page)
drop policy if exists "superadmin read shop products" on public.products;
create policy "superadmin read shop products"
on public.products
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

-- Billing: invoices (needed for lists on shop detail page)
drop policy if exists "superadmin read shop invoices" on public.invoices;
create policy "superadmin read shop invoices"
on public.invoices
for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

