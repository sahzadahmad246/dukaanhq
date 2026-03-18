-- Update existing inventory products safely and allow replacing gallery images

create policy "owners and admins can delete product images"
on public.product_images
for delete
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
);

create or replace function public.update_inventory_product(
  p_product_id uuid,
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
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_id uuid := p_category_id;
  v_brand_id uuid := p_brand_id;
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
      and role in ('owner', 'admin')
  ) then
    raise exception 'Access denied';
  end if;

  if not exists (
    select 1
    from public.products
    where id = p_product_id
      and shop_id = p_shop_id
  ) then
    raise exception 'Product not found';
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

  update public.products
  set
    category_id = v_category_id,
    brand_id = v_brand_id,
    name = trim(p_name),
    slug = trim(
      both '-' from regexp_replace(
        lower(trim(p_name)) || '-' || right(replace(p_product_id::text, '-', ''), 6),
        '[^a-z0-9-]+',
        '-',
        'g'
      )
    ),
    description = nullif(trim(coalesce(p_description, '')), ''),
    image_url = p_image_url,
    image_public_id = p_image_public_id,
    tracking_type = v_tracking_type,
    product_kind = p_product_kind,
    base_purchase_price = p_base_purchase_price,
    base_selling_price = p_base_selling_price,
    tax_rate = p_tax_rate,
    low_stock_threshold = p_low_stock_threshold,
    is_active = p_is_active
  where id = p_product_id
    and shop_id = p_shop_id;

  delete from public.stock_movements
  where product_id = p_product_id
    and shop_id = p_shop_id;

  delete from public.inventory_items
  where product_id = p_product_id
    and shop_id = p_shop_id;

  delete from public.product_variants
  where product_id = p_product_id
    and shop_id = p_shop_id;

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
      p_product_id,
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
        p_product_id,
        v_variant_id,
        'PURCHASE',
        (v_variant ->> 'quantity')::integer,
        'Stock updated from product edit',
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
        p_product_id,
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
        p_product_id,
        v_variant_id,
        v_inventory_item_id,
        'PURCHASE',
        1,
        'Stock updated from product edit',
        v_user_id
      );
    end loop;
  end if;

  return p_product_id;
end;
$$;

grant execute on function public.update_inventory_product(
  uuid,
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
