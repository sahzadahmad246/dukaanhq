create table if not exists public.onboarding_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_onboarding_drafts_updated_at on public.onboarding_drafts;
create trigger set_onboarding_drafts_updated_at
before update on public.onboarding_drafts
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.onboarding_drafts enable row level security;

create policy "users can view own onboarding draft"
on public.onboarding_drafts
for select
using (auth.uid() = user_id);

create policy "users can insert own onboarding draft"
on public.onboarding_drafts
for insert
with check (auth.uid() = user_id);

create policy "users can update own onboarding draft"
on public.onboarding_drafts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own onboarding draft"
on public.onboarding_drafts
for delete
using (auth.uid() = user_id);
