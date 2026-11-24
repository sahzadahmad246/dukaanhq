-- QR label metadata for serialized units and quantity-based sellable options.

alter table public.product_variants
  add column if not exists label_code text,
  add column if not exists qr_payload jsonb;

alter table public.inventory_items
  add column if not exists label_code text,
  add column if not exists qr_payload jsonb;

create unique index if not exists product_variants_shop_label_code_idx
  on public.product_variants(shop_id, label_code)
  where label_code is not null and trim(label_code) <> '';

create unique index if not exists inventory_items_shop_label_code_idx
  on public.inventory_items(shop_id, label_code)
  where label_code is not null and trim(label_code) <> '';

create table if not exists public.shop_qr_counters (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  unit_next integer not null default 1,
  qty_next integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_qr_counters enable row level security;

drop trigger if exists set_shop_qr_counters_updated_at on public.shop_qr_counters;
create trigger set_shop_qr_counters_updated_at
before update on public.shop_qr_counters
for each row execute function public.set_current_timestamp_updated_at();

drop policy if exists "users can view shop qr counters" on public.shop_qr_counters;
create policy "users can view shop qr counters"
on public.shop_qr_counters
for select using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = shop_qr_counters.shop_id
      and shop_members.user_id = auth.uid()
  )
);

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

insert into public.shop_qr_counters (shop_id)
select id
from public.shops
on conflict (shop_id) do nothing;

create or replace function public.allocate_qr_label_range(
  p_shop_id uuid,
  p_target text,
  p_count integer default 1
)
returns table(start_value integer, prefix text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target not in ('UNIT', 'QTY') then
    raise exception 'Invalid QR target';
  end if;

  if p_count is null or p_count <= 0 then
    raise exception 'Count must be greater than 0';
  end if;

  if not exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = p_shop_id
      and shop_members.user_id = v_user_id
      and shop_members.role in ('owner', 'staff')
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.shop_qr_counters (shop_id)
  values (p_shop_id)
  on conflict (shop_id) do nothing;

  if p_target = 'UNIT' then
    update public.shop_qr_counters
    set unit_next = unit_next + p_count
    where shop_id = p_shop_id
    returning unit_next - p_count, 'DUK-UNIT' into start_value, prefix;
  else
    update public.shop_qr_counters
    set qty_next = qty_next + p_count
    where shop_id = p_shop_id
    returning qty_next - p_count, 'DUK-QTY' into start_value, prefix;
  end if;

  return next;
end;
$$;

grant execute on function public.allocate_qr_label_range(uuid, text, integer) to authenticated;
