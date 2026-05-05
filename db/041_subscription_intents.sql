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
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_shop_entitlements_updated_at on public.shop_entitlements;
create trigger set_shop_entitlements_updated_at
before update on public.shop_entitlements
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.subscription_intents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  owner_email text not null,
  plan_id uuid not null references public.saas_plans(id),
  price_id uuid references public.saas_plan_prices(id),
  plan_code text not null check (plan_code in ('starter', 'growth', 'pro')),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  status text not null default 'selected' check (status in ('selected', 'trial_approved', 'payment_pending', 'payment_approved', 'expired', 'completed', 'cancelled')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  cashfree_subscription_id text,
  cashfree_cf_subscription_id text,
  cashfree_subscription_session_id text,
  cashfree_customer_id text,
  cashfree_authorization_status text,
  cashfree_payment_method text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_payment_at timestamptz,
  last_payment_at timestamptz,
  last_payment_status text,
  expires_at timestamptz not null,
  created_shop_id uuid references public.shops(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  price_id uuid references public.saas_plan_prices(id),
  source_intent_id uuid references public.subscription_intents(id) on delete set null,
  status text not null check (status in ('trialing', 'pending_authorization', 'active', 'past_due', 'cancel_at_period_end', 'cancelled', 'expired', 'locked')),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  cashfree_subscription_id text,
  cashfree_cf_subscription_id text,
  cashfree_customer_id text,
  cashfree_subscription_session_id text,
  cashfree_authorization_status text,
  cashfree_payment_method text,
  next_payment_at timestamptz,
  last_payment_at timestamptz,
  last_payment_status text,
  last_webhook_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id),
  unique (cashfree_subscription_id)
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  subscription_intent_id uuid references public.subscription_intents(id) on delete set null,
  subscription_id uuid references public.shop_subscriptions(id) on delete set null,
  provider text not null default 'cashfree',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_status text not null default 'received',
  processed_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.trial_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  owner_email text not null,
  shop_id uuid references public.shops(id) on delete set null,
  subscription_intent_id uuid references public.subscription_intents(id) on delete set null,
  plan_code text not null check (plan_code in ('starter', 'growth', 'pro')),
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  source text not null default 'self_serve' check (source in ('self_serve', 'superadmin')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, plan_code),
  unique (shop_id, plan_code)
);

alter table public.shop_entitlements
  add column if not exists plan_id uuid references public.saas_plans(id),
  add column if not exists subscription_id uuid references public.shop_subscriptions(id),
  add column if not exists access_expires_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists locked_reason text;

create index if not exists idx_subscription_intents_owner_status
  on public.subscription_intents (owner_user_id, status);

create index if not exists idx_subscription_intents_expires
  on public.subscription_intents (expires_at);

create index if not exists idx_subscription_intents_cashfree_sub
  on public.subscription_intents (cashfree_subscription_id);

create index if not exists idx_shop_subscriptions_owner
  on public.shop_subscriptions (owner_user_id);

create index if not exists idx_subscription_events_intent
  on public.subscription_events (subscription_intent_id, created_at desc);

drop trigger if exists set_subscription_intents_updated_at on public.subscription_intents;
create trigger set_subscription_intents_updated_at
before update on public.subscription_intents
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_shop_subscriptions_updated_at on public.shop_subscriptions;
create trigger set_shop_subscriptions_updated_at
before update on public.shop_subscriptions
for each row execute function public.set_current_timestamp_updated_at();

alter table public.subscription_intents enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.trial_grants enable row level security;
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
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "shop members read entitlement" on public.shop_entitlements;
create policy "shop members read entitlement"
on public.shop_entitlements
for select
using (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "owner inserts shop entitlement" on public.shop_entitlements;
create policy "owner inserts shop entitlement"
on public.shop_entitlements
for insert
with check (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "owner updates shop entitlement" on public.shop_entitlements;
create policy "owner updates shop entitlement"
on public.shop_entitlements
for update
using (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_entitlements.shop_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "superadmin all shop entitlements" on public.shop_entitlements;
create policy "superadmin all shop entitlements"
on public.shop_entitlements
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "owners read own subscription intents" on public.subscription_intents;
create policy "owners read own subscription intents"
on public.subscription_intents
for select
using (owner_user_id = auth.uid());

drop policy if exists "owners insert own subscription intents" on public.subscription_intents;
create policy "owners insert own subscription intents"
on public.subscription_intents
for insert
with check (owner_user_id = auth.uid());

drop policy if exists "owners update own open subscription intents" on public.subscription_intents;
create policy "owners update own open subscription intents"
on public.subscription_intents
for update
using (owner_user_id = auth.uid() and status in ('selected', 'trial_approved', 'payment_pending', 'payment_approved'))
with check (owner_user_id = auth.uid());

drop policy if exists "superadmin all subscription intents" on public.subscription_intents;
create policy "superadmin all subscription intents"
on public.subscription_intents
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "shop members read shop subscriptions" on public.shop_subscriptions;
create policy "shop members read shop subscriptions"
on public.shop_subscriptions
for select
using (
  exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_subscriptions.shop_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "shop owners insert shop subscriptions" on public.shop_subscriptions;
create policy "shop owners insert shop subscriptions"
on public.shop_subscriptions
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.shop_members m
    where m.shop_id = shop_subscriptions.shop_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "superadmin all shop subscriptions" on public.shop_subscriptions;
create policy "superadmin all shop subscriptions"
on public.shop_subscriptions
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "owners read own trial grants" on public.trial_grants;
create policy "owners read own trial grants"
on public.trial_grants
for select
using (owner_user_id = auth.uid());

drop policy if exists "superadmin all trial grants" on public.trial_grants;
create policy "superadmin all trial grants"
on public.trial_grants
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists "shop members read subscription events" on public.subscription_events;
create policy "shop members read subscription events"
on public.subscription_events
for select
using (
  shop_id is not null
  and exists (
    select 1 from public.shop_members m
    where m.shop_id = subscription_events.shop_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  )
);

drop policy if exists "owners read own pre-shop subscription events" on public.subscription_events;
create policy "owners read own pre-shop subscription events"
on public.subscription_events
for select
using (
  subscription_intent_id is not null
  and exists (
    select 1 from public.subscription_intents si
    where si.id = subscription_events.subscription_intent_id
      and si.owner_user_id = auth.uid()
  )
);

drop policy if exists "superadmin all subscription events" on public.subscription_events;
create policy "superadmin all subscription events"
on public.subscription_events
for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));
