-- Dodo Payments migration.
-- Adds provider-neutral subscription columns while keeping old Cashfree columns
-- for historical data/backward-compatible reads during rollout.

alter table public.subscription_intents
  add column if not exists provider text not null default 'dodo',
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_checkout_url text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payment_method text;

alter table public.shop_subscriptions
  add column if not exists provider text not null default 'dodo',
  add column if not exists provider_subscription_id text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payment_method text;

alter table public.shop_entitlements
  add column if not exists provider text not null default 'dodo',
  add column if not exists provider_subscription_id text,
  add column if not exists provider_customer_id text;

alter table public.saas_plan_prices
  add column if not exists provider text not null default 'dodo',
  add column if not exists provider_product_id text,
  add column if not exists provider_price_id text,
  add column if not exists provider_trial_days integer not null default 0 check (provider_trial_days >= 0);

create index if not exists idx_subscription_intents_provider_checkout
  on public.subscription_intents (provider, provider_checkout_session_id);

create index if not exists idx_subscription_intents_provider_subscription
  on public.subscription_intents (provider, provider_subscription_id);

create unique index if not exists idx_shop_subscriptions_provider_subscription_unique
  on public.shop_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_saas_plan_prices_provider_product
  on public.saas_plan_prices (provider, provider_product_id);

update public.subscription_intents
set
  provider = 'cashfree',
  provider_checkout_session_id = coalesce(provider_checkout_session_id, cashfree_subscription_session_id),
  provider_subscription_id = coalesce(provider_subscription_id, cashfree_subscription_id),
  provider_customer_id = coalesce(provider_customer_id, cashfree_customer_id),
  provider_status = coalesce(provider_status, cashfree_authorization_status),
  provider_payment_method = coalesce(provider_payment_method, cashfree_payment_method)
where cashfree_subscription_id is not null
   or cashfree_subscription_session_id is not null
   or cashfree_customer_id is not null;

update public.shop_subscriptions
set
  provider = 'cashfree',
  provider_checkout_session_id = coalesce(provider_checkout_session_id, cashfree_subscription_session_id),
  provider_subscription_id = coalesce(provider_subscription_id, cashfree_subscription_id),
  provider_customer_id = coalesce(provider_customer_id, cashfree_customer_id),
  provider_status = coalesce(provider_status, cashfree_authorization_status),
  provider_payment_method = coalesce(provider_payment_method, cashfree_payment_method)
where cashfree_subscription_id is not null
   or cashfree_subscription_session_id is not null
   or cashfree_customer_id is not null;

update public.shop_entitlements
set
  provider = 'cashfree',
  provider_subscription_id = coalesce(provider_subscription_id, cashfree_subscription_id),
  provider_customer_id = coalesce(provider_customer_id, cashfree_customer_id)
where cashfree_subscription_id is not null
   or cashfree_customer_id is not null;
