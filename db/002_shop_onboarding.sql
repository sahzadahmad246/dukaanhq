create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null unique,
  category text not null default 'electronics_mobile',
  logo_url text,
  phone text not null,
  email text not null,
  whatsapp text,
  gst_number text,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  invoice_prefix text not null,
  currency text not null default 'INR',
  tax_mode text not null default 'exclusive' check (tax_mode in ('exclusive', 'inclusive', 'no_tax')),
  invoice_footer text,
  opening_time time not null,
  closing_time time not null,
  working_days text[] not null default array['monday','tuesday','wednesday','thursday','friday','saturday'],
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'staff', 'owner', 'admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shops_updated_at on public.shops;
create trigger set_shops_updated_at
before update on public.shops
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_shop_settings_updated_at on public.shop_settings;
create trigger set_shop_settings_updated_at
before update on public.shop_settings
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.shops enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_members enable row level security;

create policy "users can insert own shops"
on public.shops
for insert
with check (auth.uid() = created_by);

create policy "users can view member shops"
on public.shops
for select
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shops.id
      and shop_members.user_id = auth.uid()
  )
);

create policy "owners can update own shops"
on public.shops
for update
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shops.id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shops.id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
);

create policy "users can insert own owner membership"
on public.shop_members
for insert
with check (auth.uid() = user_id and role = 'owner');

create policy "users can view own memberships"
on public.shop_members
for select
using (auth.uid() = user_id);

create policy "owners can view shop settings"
on public.shop_settings
for select
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_settings.shop_id
      and shop_members.user_id = auth.uid()
  )
);

create policy "owners can insert shop settings"
on public.shop_settings
for insert
with check (
  exists (
    select 1
    from public.shops
    where shops.id = shop_settings.shop_id
      and shops.created_by = auth.uid()
  )
);

create policy "owners can update shop settings"
on public.shop_settings
for update
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_settings.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_settings.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
);
