alter table public.shop_members
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists mobile_number text,
  add column if not exists status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists suspended_at timestamptz;

create table if not exists public.shop_member_invitations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('owner', 'admin')),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED')),
  invite_token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_shop_member_invitations_updated_at on public.shop_member_invitations;
create trigger set_shop_member_invitations_updated_at
before update on public.shop_member_invitations
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.shop_member_invitations enable row level security;

drop policy if exists "owners can manage invitations" on public.shop_member_invitations;
create policy "owners can manage invitations"
on public.shop_member_invitations
for all
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_member_invitations.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role = 'owner'
      and shop_members.status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_member_invitations.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role = 'owner'
      and shop_members.status = 'ACTIVE'
  )
);
