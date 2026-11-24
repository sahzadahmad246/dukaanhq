create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('starter', 'growth', 'pro')),
  display_name text not null,
  tagline text not null default '',
  description text,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  entitlements jsonb not null default '{}'::jsonb,
  support_level text not null default 'standard' check (support_level in ('standard', 'priority')),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saas_plans
  add column if not exists tagline text not null default '',
  add column if not exists entitlements jsonb not null default '{}'::jsonb,
  add column if not exists support_level text not null default 'standard',
  add column if not exists sort_order integer not null default 100,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.saas_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  interval text not null check (interval in ('month', 'year')),
  interval_count integer not null default 1 check (interval_count > 0),
  currency text not null default 'INR',
  regular_price_paise bigint not null default 0 check (regular_price_paise >= 0),
  discounted_price_paise bigint check (discounted_price_paise is null or discounted_price_paise >= 0),
  discount_enabled boolean not null default false,
  discount_type text not null default 'none' check (discount_type in ('none', 'percent', 'amount')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  discount_ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, interval, interval_count)
);

create index if not exists idx_saas_plans_active_sort
  on public.saas_plans (is_active, sort_order);

create index if not exists idx_saas_plan_prices_plan_interval
  on public.saas_plan_prices (plan_id, interval, interval_count);

drop trigger if exists set_saas_plans_updated_at on public.saas_plans;
create trigger set_saas_plans_updated_at
before update on public.saas_plans
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_saas_plan_prices_updated_at on public.saas_plan_prices;
create trigger set_saas_plan_prices_updated_at
before update on public.saas_plan_prices
for each row execute function public.set_current_timestamp_updated_at();

alter table public.saas_plans enable row level security;
alter table public.saas_plan_prices enable row level security;

drop policy if exists "superadmin all saas plans" on public.saas_plans;
create policy "superadmin all saas plans"
on public.saas_plans
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "public read active saas plans" on public.saas_plans;
create policy "public read active saas plans"
on public.saas_plans
for select
using (is_active = true);

drop policy if exists "superadmin all saas plan prices" on public.saas_plan_prices;
create policy "superadmin all saas plan prices"
on public.saas_plan_prices
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "public read active saas plan prices" on public.saas_plan_prices;
create policy "public read active saas plan prices"
on public.saas_plan_prices
for select
using (
  is_active = true
  and exists (
    select 1
    from public.saas_plans sp
    where sp.id = saas_plan_prices.plan_id
      and sp.is_active = true
  )
);

insert into public.saas_plans (
  code,
  display_name,
  tagline,
  description,
  features,
  limits,
  entitlements,
  support_level,
  sort_order,
  is_active
)
values
  (
    'starter',
    'Starter',
    'Run basic billing and inventory.',
    'For small shops starting with inventory and invoice control.',
    '["Add up to 25 inventory products", "Create 50 invoices per month", "Basic PDF invoice", "Loan/EMI details inside bills", "Standard support"]'::jsonb,
    '{"products": 25, "invoices_per_month": 50, "staff": 1, "whatsapp_messages_per_month": 0}'::jsonb,
    '{"inventory": true, "invoices": true, "basic_pdf_invoice": true, "loan_emi_details": true, "customer_signature": false, "shop_stamp": false, "staff_access": false, "public_shop_page": false, "whatsapp_invoice_sending": false, "auto_emi_reminders": false}'::jsonb,
    'standard',
    10,
    true
  ),
  (
    'growth',
    'Growth',
    'Add team access and professional invoices.',
    'For daily shop operations with staff, branding, and higher limits.',
    '["Everything in Starter", "Add up to 250 inventory products", "Create 500 invoices per month", "Invite staff to manage the shop", "Customer signature and shop stamp on PDF invoices", "Public shop page", "Priority support"]'::jsonb,
    '{"products": 250, "invoices_per_month": 500, "staff": 3, "whatsapp_messages_per_month": 0}'::jsonb,
    '{"inventory": true, "invoices": true, "basic_pdf_invoice": true, "loan_emi_details": true, "customer_signature": true, "shop_stamp": true, "staff_access": true, "public_shop_page": true, "whatsapp_invoice_sending": false, "auto_emi_reminders": false}'::jsonb,
    'priority',
    20,
    true
  ),
  (
    'pro',
    'Pro',
    'Unlock automation and unlimited scale.',
    'For serious shops that want WhatsApp automation, EMI reminders, and no product or invoice limits.',
    '["Everything in Growth", "Unlimited products and invoices", "WhatsApp invoice sending", "Auto EMI WhatsApp reminders", "All current and future advanced features", "Priority support"]'::jsonb,
    '{"products": null, "invoices_per_month": null, "staff": null, "whatsapp_messages_per_month": null}'::jsonb,
    '{"inventory": true, "invoices": true, "basic_pdf_invoice": true, "loan_emi_details": true, "customer_signature": true, "shop_stamp": true, "staff_access": true, "public_shop_page": true, "whatsapp_invoice_sending": true, "auto_emi_reminders": true}'::jsonb,
    'priority',
    30,
    true
  )
on conflict (code) do nothing;

insert into public.saas_plan_prices (
  plan_id,
  interval,
  interval_count,
  currency,
  regular_price_paise,
  discounted_price_paise,
  discount_enabled,
  discount_type,
  discount_value,
  is_active
)
select sp.id, prices.interval, 1, 'INR', prices.regular_price_paise, null, false, 'none', 0, true
from public.saas_plans sp
cross join lateral (
  values
    ('starter', 'month', 49900),
    ('starter', 'year', 499000),
    ('growth', 'month', 99900),
    ('growth', 'year', 999000),
    ('pro', 'month', 149900),
    ('pro', 'year', 1499000)
) as prices(code, interval, regular_price_paise)
where prices.code = sp.code
on conflict (plan_id, interval, interval_count) do nothing;
