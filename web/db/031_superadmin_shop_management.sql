-- Superadmin: cross-tenant shop management (suspend/unsuspend).
-- This keeps tenant RLS intact while allowing SaaS owner actions via RPC.

create or replace function public.superadmin_set_shop_status(
  p_shop_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id and p.role = 'superadmin'
  ) then
    raise exception 'Not allowed';
  end if;

  if v_normalized_status not in ('active', 'inactive', 'suspended') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.shops
  set status = v_normalized_status
  where id = p_shop_id;

  if not found then
    raise exception 'Shop not found';
  end if;

  -- Enforce shop suspension at the membership layer too (app gates on membership.status).
  if v_normalized_status = 'suspended' then
    update public.shop_members
    set status = 'SUSPENDED',
        suspended_at = now()
    where shop_id = p_shop_id
      and status <> 'SUSPENDED';
  else
    update public.shop_members
    set status = 'ACTIVE',
        suspended_at = null
    where shop_id = p_shop_id
      and status <> 'ACTIVE';
  end if;
end;
$$;

grant execute on function public.superadmin_set_shop_status(uuid, text) to authenticated;

