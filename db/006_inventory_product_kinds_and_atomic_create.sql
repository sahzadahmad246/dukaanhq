-- Product-kind support, richer variants, seeded categories, and atomic product creation

alter table public.products
  add column if not exists product_kind text;

update public.products
set product_kind = case
  when tracking_type = 'QUANTITY_BASED' then 'QUANTITY_BASED'
  else 'SERIALIZED'
end
where product_kind is null;

alter table public.products
  alter column product_kind set default 'QUANTITY_BASED';

alter table public.products
  alter column product_kind set not null;

alter table public.products
  drop constraint if exists products_product_kind_check;

alter table public.products
  add constraint products_product_kind_check
  check (product_kind in ('MOBILE', 'SERIALIZED', 'QUANTITY_BASED'));

alter table public.product_variants
  add column if not exists color text,
  add column if not exists storage_label text;

alter table public.inventory_items
  add column if not exists identifier_type text;

update public.inventory_items
set identifier_type = 'SERIAL_NUMBER'
where identifier_type is null;

alter table public.inventory_items
  alter column identifier_type set default 'SERIAL_NUMBER';

alter table public.inventory_items
  alter column identifier_type set not null;

alter table public.inventory_items
  drop constraint if exists inventory_items_identifier_type_check;

alter table public.inventory_items
  add constraint inventory_items_identifier_type_check
  check (identifier_type in ('IMEI', 'SERIAL_NUMBER', 'UNIQUE_ID'));

insert into public.categories (shop_id, name, slug)
select
  shops.id,
  seed.name,
  seed.slug
from public.shops
cross join (
  values
    ('Mobile Phones', 'mobile-phones'),
    ('Chargers', 'chargers'),
    ('Cables', 'cables'),
    ('Headphones', 'headphones'),
    ('Earphones', 'earphones'),
    ('Neckbands', 'neckbands'),
    ('Smartwatches', 'smartwatches'),
    ('Power Banks', 'power-banks'),
    ('Cases & Covers', 'cases-covers'),
    ('Screen Protectors', 'screen-protectors'),
    ('Bluetooth Speakers', 'bluetooth-speakers'),
    ('Adapters', 'adapters'),
    ('Memory Cards', 'memory-cards'),
    ('Accessories', 'accessories'),
    ('Laptops', 'laptops'),
    ('Tablets', 'tablets')
) as seed(name, slug)
on conflict (shop_id, slug) do nothing;

create or replace function public.create_inventory_product(
  p_shop_id uuid,
  p_name text,
  p_category_id uuid default null,
  p_category_name text default null,
  p_brand_id uuid default null,
  p_brand_name text default null,
  p_description text default null,
  p_image_url text default null,
  p_image_public_id text default null,
  p_product_kind text default 'QUANTITY_BASED',
  p_base_purchase_price numeric default 0,
  p_base_selling_price numeric default 0,
  p_tax_rate numeric default 0,
  p_low_stock_threshold integer default 0,
  p_is_active boolean default true,
  p_variants jsonb default '[]'::jsonb,
  p_units jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_id uuid := p_category_id;
  v_brand_id uuid := p_brand_id;
  v_product_id uuid;
  v_variant_id uuid;
  v_inventory_item_id uuid;
  v_variant jsonb;
  v_unit jsonb;
  v_variant_map jsonb := '{}'::jsonb;
  v_variant_key text;
  v_identifier_type text;
  v_identifier_value text;
  v_tracking_type text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.shop_members
    where shop_id = p_shop_id
      and user_id = v_user_id
      and role in ('owner', 'staff')
  ) then
    raise exception 'Access denied';
  end if;

  if p_product_kind not in ('MOBILE', 'SERIALIZED', 'QUANTITY_BASED') then
    raise exception 'Invalid product kind';
  end if;

  v_tracking_type := case
    when p_product_kind = 'QUANTITY_BASED' then 'QUANTITY_BASED'
    else 'SERIALIZED'
  end;

  if v_category_id is null and nullif(trim(coalesce(p_category_name, '')), '') is not null then
    insert into public.categories (shop_id, name, slug)
    values (
      p_shop_id,
      trim(p_category_name),
      trim(both '-' from regexp_replace(lower(trim(p_category_name)), '[^a-z0-9]+', '-', 'g'))
    )
    on conflict (shop_id, slug) do update set name = excluded.name
    returning id into v_category_id;
  end if;

  if v_brand_id is null and nullif(trim(coalesce(p_brand_name, '')), '') is not null then
    insert into public.brands (shop_id, name, slug)
    values (
      p_shop_id,
      trim(p_brand_name),
      trim(both '-' from regexp_replace(lower(trim(p_brand_name)), '[^a-z0-9]+', '-', 'g'))
    )
    on conflict (shop_id, slug) do update set name = excluded.name
    returning id into v_brand_id;
  end if;

  insert into public.products (
    shop_id,
    category_id,
    brand_id,
    name,
    slug,
    description,
    image_url,
    image_public_id,
    tracking_type,
    product_kind,
    base_purchase_price,
    base_selling_price,
    tax_rate,
    low_stock_threshold,
    is_active
  )
  values (
    p_shop_id,
    v_category_id,
    v_brand_id,
    trim(p_name),
    trim(both '-' from regexp_replace(lower(trim(p_name)) || '-' || right(replace(gen_random_uuid()::text, '-', ''), 6), '[^a-z0-9-]+', '-', 'g')),
    nullif(trim(coalesce(p_description, '')), ''),
    p_image_url,
    p_image_public_id,
    v_tracking_type,
    p_product_kind,
    p_base_purchase_price,
    p_base_selling_price,
    p_tax_rate,
    p_low_stock_threshold,
    p_is_active
  )
  returning id into v_product_id;

  if jsonb_array_length(p_variants) = 0 then
    raise exception 'At least one variant is required';
  end if;

  for v_variant in
    select value from jsonb_array_elements(p_variants)
  loop
    v_variant_key := coalesce(v_variant ->> 'temp_key', gen_random_uuid()::text);

    insert into public.product_variants (
      shop_id,
      product_id,
      name,
      color,
      storage_label,
      purchase_price_override,
      selling_price_override,
      quantity
    )
    values (
      p_shop_id,
      v_product_id,
      coalesce(nullif(trim(v_variant ->> 'name'), ''), 'Default'),
      nullif(trim(v_variant ->> 'color'), ''),
      nullif(trim(v_variant ->> 'storage_label'), ''),
      nullif(v_variant ->> 'purchase_price_override', '')::numeric,
      nullif(v_variant ->> 'selling_price_override', '')::numeric,
      case
        when p_product_kind = 'QUANTITY_BASED' then greatest(coalesce((v_variant ->> 'quantity')::integer, 0), 0)
        else 0
      end
    )
    returning id into v_variant_id;

    v_variant_map := v_variant_map || jsonb_build_object(v_variant_key, v_variant_id::text);

    if p_product_kind = 'QUANTITY_BASED' and coalesce((v_variant ->> 'quantity')::integer, 0) > 0 then
      insert into public.stock_movements (
        shop_id,
        product_id,
        variant_id,
        type,
        quantity_change,
        reason,
        performed_by
      )
      values (
        p_shop_id,
        v_product_id,
        v_variant_id,
        'PURCHASE',
        (v_variant ->> 'quantity')::integer,
        'Initial stock entry',
        v_user_id
      );
    end if;
  end loop;

  if p_product_kind <> 'QUANTITY_BASED' then
    if jsonb_array_length(p_units) = 0 then
      raise exception 'At least one inventory unit is required for serialized products';
    end if;

    for v_unit in
      select value from jsonb_array_elements(p_units)
    loop
      v_variant_id := (v_variant_map ->> (v_unit ->> 'variant_temp_key'))::uuid;
      v_identifier_type := case
        when p_product_kind = 'MOBILE' then 'IMEI'
        else coalesce(nullif(trim(v_unit ->> 'identifier_type'), ''), 'SERIAL_NUMBER')
      end;
      v_identifier_value := trim(coalesce(v_unit ->> 'identifier_value', ''));

      if v_variant_id is null or v_identifier_value = '' then
        raise exception 'Invalid unit mapping';
      end if;

      insert into public.inventory_items (
        shop_id,
        product_id,
        variant_id,
        serial_number,
        identifier_type,
        purchase_price,
        status
      )
      values (
        p_shop_id,
        v_product_id,
        v_variant_id,
        v_identifier_value,
        v_identifier_type,
        p_base_purchase_price,
        'IN_STOCK'
      )
      returning id into v_inventory_item_id;

      insert into public.stock_movements (
        shop_id,
        product_id,
        variant_id,
        inventory_item_id,
        type,
        quantity_change,
        reason,
        performed_by
      )
      values (
        p_shop_id,
        v_product_id,
        v_variant_id,
        v_inventory_item_id,
        'PURCHASE',
        1,
        'Initial stock entry',
        v_user_id
      );
    end loop;
  end if;

  return v_product_id;
end;
$$;

grant execute on function public.create_inventory_product(
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  boolean,
  jsonb,
  jsonb
) to authenticated;
