-- Minimal second-hand phone stock. Seller data stays out of customer invoices.
begin;

alter table public.products add column if not exists is_second_hand boolean not null default false;
alter table public.invoices add column if not exists is_second_hand boolean not null default false;
create index if not exists products_second_hand_idx on public.products(shop_id, is_second_hand);
create index if not exists invoices_second_hand_idx on public.invoices(shop_id, is_second_hand, invoice_date desc);

create table if not exists public.second_hand_purchases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null unique references public.products(id) on delete cascade,
  seller_name text not null check (length(trim(seller_name)) between 1 and 120),
  seller_phone text not null,
  purchase_source text not null check (length(trim(purchase_source)) between 1 and 200),
  purchase_date date not null,
  original_invoice_path text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
alter table public.second_hand_purchases enable row level security;
drop policy if exists second_hand_owner_select on public.second_hand_purchases;
create policy second_hand_owner_select on public.second_hand_purchases for select to authenticated using (
  exists (select 1 from public.shop_members m where m.shop_id = second_hand_purchases.shop_id
    and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'ACTIVE')
);
drop policy if exists second_hand_owner_insert on public.second_hand_purchases;
create policy second_hand_owner_insert on public.second_hand_purchases for insert to authenticated with check (
  created_by = auth.uid() and exists (select 1 from public.shop_members m
    where m.shop_id = second_hand_purchases.shop_id and m.user_id = auth.uid()
      and m.role = 'owner' and m.status = 'ACTIVE')
  and exists (select 1 from public.products p where p.id = second_hand_purchases.product_id
    and p.shop_id = second_hand_purchases.shop_id and p.is_second_hand)
);
grant select, insert on public.second_hand_purchases to authenticated;

-- Private optional purchase invoices; only active owners of that shop can access them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('second-hand-invoices', 'second-hand-invoices', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists second_hand_invoice_owner_access on storage.objects;
create policy second_hand_invoice_owner_access on storage.objects for all to authenticated
using (bucket_id = 'second-hand-invoices' and exists (
  select 1 from public.shop_members m where m.shop_id::text = (storage.foldername(name))[1]
    and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'ACTIVE'
)) with check (bucket_id = 'second-hand-invoices' and exists (
  select 1 from public.shop_members m where m.shop_id::text = (storage.foldername(name))[1]
    and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'ACTIVE'
));

create or replace function public.create_second_hand_phone(p_shop_id uuid, p_phone jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_product_id uuid := gen_random_uuid();
  v_variant_id uuid;
  v_item_id uuid;
  v_brand_id uuid;
  v_imei_1 text := trim(p_phone->>'imei_1');
  v_imei_2 text := nullif(trim(p_phone->>'imei_2'), '');
  v_purchase_price numeric := (p_phone->>'purchase_price')::numeric;
  v_selling_price numeric := (p_phone->>'selling_price')::numeric;
  v_date date := (p_phone->>'purchase_date')::date;
  v_invoice_path text := nullif(p_phone->>'original_invoice_path', '');
begin
  if not exists (select 1 from public.shop_members m where m.shop_id = p_shop_id
    and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'ACTIVE') then
    raise exception 'Only the shop owner can add second-hand phones';
  end if;
  if coalesce(trim(p_phone->>'seller_name'), '') = ''
    or coalesce(trim(p_phone->>'purchase_source'), '') = ''
    or coalesce(trim(p_phone->>'brand'), '') = '' or coalesce(trim(p_phone->>'model'), '') = ''
    or coalesce(trim(p_phone->>'storage'), '') = '' or coalesce(trim(p_phone->>'color'), '') = ''
    or length(regexp_replace(coalesce(p_phone->>'seller_phone', ''), '\D', '', 'g')) not between 7 and 15 then
    raise exception 'Complete the seller and phone details';
  end if;
  if v_imei_1 is null or v_imei_1 !~ '^\d{15}$'
    or (v_imei_2 is not null and (v_imei_2 !~ '^\d{15}$' or v_imei_2 = v_imei_1)) then
    raise exception 'Enter valid, different 15-digit IMEIs';
  end if;
  if v_purchase_price is null or v_selling_price is null or v_purchase_price < 0 or v_selling_price < 0
    or v_date is null or v_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Enter valid prices and purchase date';
  end if;
  if v_invoice_path is not null and split_part(v_invoice_path, '/', 1) <> p_shop_id::text then
    raise exception 'Invalid purchase invoice';
  end if;

  insert into public.brands(shop_id, name, slug)
  values (p_shop_id, trim(p_phone->>'brand'),
    coalesce(nullif(trim(both '-' from regexp_replace(lower(trim(p_phone->>'brand')), '[^a-z0-9]+', '-', 'g')), ''), 'brand-' || v_product_id::text))
  on conflict (shop_id, slug) do update set name = excluded.name returning id into v_brand_id;

  insert into public.products(id, shop_id, brand_id, name, slug, product_kind, tracking_type,
    base_purchase_price, base_selling_price, tax_rate, is_second_hand, created_by)
  values (v_product_id, p_shop_id, v_brand_id, trim(p_phone->>'model'), 'used-' || v_product_id::text,
    'MOBILE', 'SERIALIZED', v_purchase_price, v_selling_price, 0, true, auth.uid());
  insert into public.product_variants(shop_id, product_id, name, color, storage_label, quantity)
  values (p_shop_id, v_product_id, concat_ws(' / ', trim(p_phone->>'storage'), trim(p_phone->>'color')),
    trim(p_phone->>'color'), trim(p_phone->>'storage'), 0) returning id into v_variant_id;
  insert into public.inventory_items(shop_id, product_id, variant_id, serial_number, identifier_type,
    imei_1, imei_2, purchase_price, status)
  values (p_shop_id, v_product_id, v_variant_id, concat_ws(' | ', v_imei_1, v_imei_2), 'IMEI',
    v_imei_1, v_imei_2, v_purchase_price, 'IN_STOCK') returning id into v_item_id;
  insert into public.inventory_item_identifiers(shop_id, inventory_item_id, identifier_type, identifier_value, sort_order)
  values (p_shop_id, v_item_id, 'IMEI', v_imei_1, 0);
  if v_imei_2 is not null then
    insert into public.inventory_item_identifiers(shop_id, inventory_item_id, identifier_type, identifier_value, sort_order)
    values (p_shop_id, v_item_id, 'IMEI', v_imei_2, 1);
  end if;
  insert into public.stock_movements(shop_id, product_id, variant_id, inventory_item_id, type,
    quantity_change, reason, performed_by)
  values (p_shop_id, v_product_id, v_variant_id, v_item_id, 'PURCHASE', 1, 'Second-hand phone purchase', auth.uid());
  insert into public.second_hand_purchases(shop_id, product_id, seller_name, seller_phone,
    purchase_source, purchase_date, original_invoice_path, created_by)
  values (p_shop_id, v_product_id, trim(p_phone->>'seller_name'), trim(p_phone->>'seller_phone'),
    trim(p_phone->>'purchase_source'), v_date, v_invoice_path, auth.uid());
  return v_product_id;
end;
$$;
revoke all on function public.create_second_hand_phone(uuid, jsonb) from public;
grant execute on function public.create_second_hand_phone(uuid, jsonb) to authenticated;

-- Reuse the existing atomic invoice / IMEI sale, with a durable second-hand label.
create or replace function public.create_second_hand_invoice(
  p_shop_id uuid, p_customer jsonb, p_items jsonb, p_payment_method text default 'CASH',
  p_payment_details jsonb default null, p_customer_signature_url text default null,
  p_invoice_pdf_url text default null, p_notes text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_invoice_id uuid;
begin
  if not exists (select 1 from public.shop_members m where m.shop_id = p_shop_id
    and m.user_id = auth.uid() and m.role = 'owner' and m.status = 'ACTIVE') then
    raise exception 'Only the shop owner can create second-hand bills';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid invoice items'; end if;
  if not exists (select 1 from jsonb_array_elements(p_items) i where nullif(i->>'product_id', '') is not null)
    or exists (select 1 from jsonb_array_elements(p_items) i where nullif(i->>'product_id', '') is not null
      and not exists (select 1 from public.products p where p.id = (i->>'product_id')::uuid
        and p.shop_id = p_shop_id and p.is_second_hand)) then
    raise exception 'Select second-hand stock for this bill';
  end if;
  v_invoice_id := public.create_inventory_invoice(p_shop_id, p_customer, p_items, p_payment_method,
    p_payment_details, p_customer_signature_url, p_invoice_pdf_url, p_notes);
  update public.invoices set is_second_hand = true where id = v_invoice_id and shop_id = p_shop_id;
  return v_invoice_id;
end;
$$;
revoke all on function public.create_second_hand_invoice(uuid, jsonb, jsonb, text, jsonb, text, text, text) from public;
grant execute on function public.create_second_hand_invoice(uuid, jsonb, jsonb, text, jsonb, text, text, text) to authenticated;

commit;
