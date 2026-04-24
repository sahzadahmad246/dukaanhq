-- Migration 036: Add created_by column to products and update RPCs
-- This fixes the "column created_by does not exist" error.

-- 1. Add the column to the products table
alter table public.products 
add column if not exists created_by uuid references auth.users(id);

-- 2. Backfill existing products: set creator to the shop owner
update public.products p
set created_by = s.created_by
from public.shops s
where p.shop_id = s.id
and p.created_by is null;

-- 3. Update the create_inventory_product function to record v_user_id
create or replace function public.create_inventory_product(
  p_shop_id uuid,
  p_name text,
  p_category_id uuid default null,
  p_category_name text default null,
  p_brand_id uuid default null,
  p_brand_name text default null,
  p_description text default null,
  p_short_description text default null,
  p_image_url text default null,
  p_image_public_id text default null,
  p_product_kind text default 'QUANTITY_BASED',
  p_base_purchase_price numeric default 0,
  p_base_selling_price numeric default 0,
  p_tax_rate numeric default 0,
  p_low_stock_threshold integer default 0,
  p_is_active boolean default true,
  p_variants jsonb default '[]'::jsonb,
  p_units jsonb default '[]'::jsonb,
  p_highlights jsonb default '[]'::jsonb
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
  v_highlight jsonb;
  v_variant_map jsonb := '{}'::jsonb;
  v_variant_key text;
  v_identifier_type text;
  v_identifier_value text;
  v_tracking_type text;
  v_imei_1 text;
  v_imei_2 text;
  v_serial_number text;
  v_unique_identifier text;
  v_highlight_label text;
  v_highlight_value text;
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
    short_description,
    image_url,
    image_public_id,
    tracking_type,
    product_kind,
    base_purchase_price,
    base_selling_price,
    tax_rate,
    low_stock_threshold,
    is_active,
    created_by
  )
  values (
    p_shop_id,
    v_category_id,
    v_brand_id,
    trim(p_name),
    trim(both '-' from regexp_replace(lower(trim(p_name)) || '-' || right(replace(gen_random_uuid()::text, '-', ''), 6), '[^a-z0-9-]+', '-', 'g')),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_short_description, '')), ''),
    p_image_url,
    p_image_public_id,
    v_tracking_type,
    p_product_kind,
    p_base_purchase_price,
    p_base_selling_price,
    p_tax_rate,
    p_low_stock_threshold,
    p_is_active,
    v_user_id
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
      v_imei_1 := null;
      v_imei_2 := null;
      v_serial_number := null;
      v_unique_identifier := null;

      if v_variant_id is null then
        raise exception 'Invalid unit mapping';
      end if;

      if p_product_kind = 'MOBILE' then
        v_imei_1 := nullif(trim(coalesce(v_unit ->> 'imei_1', split_part(v_identifier_value, ' | ', 1))), '');
        v_imei_2 := nullif(trim(coalesce(v_unit ->> 'imei_2', case when position(' | ' in v_identifier_value) > 0 then split_part(v_identifier_value, ' | ', 2) else '' end)), '');
        v_serial_number := concat_ws(' | ', v_imei_1, v_imei_2);

        if v_imei_1 is null then
          raise exception 'Mobile products require IMEI 1';
        end if;
      elsif v_identifier_type = 'UNIQUE_ID' then
        v_unique_identifier := nullif(trim(coalesce(v_unit ->> 'unique_identifier', v_identifier_value)), '');
        v_serial_number := v_unique_identifier;

        if v_unique_identifier is null then
          raise exception 'Unique identifier is required';
        end if;
      else
        v_serial_number := nullif(trim(coalesce(v_unit ->> 'serial_number', v_identifier_value)), '');

        if v_serial_number is null then
          raise exception 'Serial number is required';
        end if;
      end if;

      insert into public.inventory_items (
        shop_id,
        product_id,
        variant_id,
        serial_number,
        identifier_type,
        imei_1,
        imei_2,
        unique_identifier,
        purchase_price,
        status
      )
      values (
        p_shop_id,
        v_product_id,
        v_variant_id,
        v_serial_number,
        v_identifier_type,
        v_imei_1,
        v_imei_2,
        v_unique_identifier,
        p_base_purchase_price,
        'IN_STOCK'
      )
      returning id into v_inventory_item_id;

      if v_imei_1 is not null then
        insert into public.inventory_item_identifiers (
          shop_id,
          inventory_item_id,
          identifier_type,
          identifier_value,
          sort_order
        )
        values (
          p_shop_id,
          v_inventory_item_id,
          'IMEI',
          v_imei_1,
          0
        );
      end if;

      if v_imei_2 is not null then
        insert into public.inventory_item_identifiers (
          shop_id,
          inventory_item_id,
          identifier_type,
          identifier_value,
          sort_order
        )
        values (
          p_shop_id,
          v_inventory_item_id,
          'IMEI',
          v_imei_2,
          1
        );
      end if;

      if p_product_kind <> 'MOBILE' and v_serial_number is not null then
        insert into public.inventory_item_identifiers (
          shop_id,
          inventory_item_id,
          identifier_type,
          identifier_value,
          sort_order
        )
        values (
          p_shop_id,
          v_inventory_item_id,
          v_identifier_type,
          v_serial_number,
          0
        );
      end if;

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

  if jsonb_typeof(p_highlights) = 'array' then
    for v_highlight in
      select value from jsonb_array_elements(p_highlights)
    loop
      v_highlight_label := nullif(trim(coalesce(v_highlight ->> 'label', '')), '');
      v_highlight_value := nullif(trim(coalesce(v_highlight ->> 'value', '')), '');

      if v_highlight_label is null or v_highlight_value is null then
        continue;
      end if;

      insert into public.product_highlights (
        shop_id,
        product_id,
        label,
        value,
        sort_order
      )
      values (
        p_shop_id,
        v_product_id,
        v_highlight_label,
        v_highlight_value,
        greatest(coalesce((v_highlight ->> 'sort_order')::integer, 0), 0)
      );
    end loop;
  end if;

  return v_product_id;
end;
$$;
