-- Phase 2 compatibility only. Review/apply to staging before enabling the API.
-- Existing UUIDs, roles, emails, memberships, billing and stock remain untouched.
begin;

alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists onboarding_intent text;
alter table public.profiles drop constraint if exists profiles_onboarding_intent_check;
alter table public.profiles add constraint profiles_onboarding_intent_check
  check (onboarding_intent is null or onboarding_intent in ('owner', 'staff'));

comment on column public.profiles.onboarding_intent is
  'User-selected onboarding intent only. Does not grant ownership, staff membership or administrative permissions.';

-- Public authenticated sessions may edit their own profile under legacy RLS.
-- They must never be able to self-promote into a platform administrator. Existing
-- service-role provisioning, trusted definer functions and owner/staff flows remain.
create or replace function public.guard_profile_platform_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.role in ('admin','superadmin') then
    if tg_op = 'INSERT' then
      raise exception 'Platform role assignment requires trusted provisioning' using errcode = '42501';
    elsif new.role is distinct from old.role then
      raise exception 'Platform role assignment requires trusted provisioning' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_platform_role on public.profiles;
create trigger guard_profile_platform_role before insert or update of role on public.profiles
for each row execute function public.guard_profile_platform_role();

commit;
