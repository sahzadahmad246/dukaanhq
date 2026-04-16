-- Product catalog foundation for richer electronics inventory.
-- Adds:
-- 1) short product description
-- 2) structured product highlights/specs
-- 3) structured per-unit identifiers for serialized items
-- 4) updated product create/update RPCs that support the new fields

alter table public.products
  add column if not exists short_description text;

create table if not exists public.product_highlights (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_highlights_product_id_idx
  on public.product_highlights(product_id, sort_order);

alter table public.product_highlights enable row level security;

drop trigger if exists set_product_highlights_updated_at on public.product_highlights;
create trigger set_product_highlights_updated_at
before update on public.product_highlights
for each row execute function public.set_current_timestamp_updated_at();

drop policy if exists "users can view shop product highlights" on public.product_highlights;
create policy "users can view shop product highlights"
on public.product_highlights
for select using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_highlights.shop_id
      and shop_members.user_id = auth.uid()
  )
);

drop policy if exists "owners and admins can manage product highlights" on public.product_highlights;
create policy "owners and admins can manage product highlights"
on public.product_highlights
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_highlights.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_highlights.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

alter table public.inventory_items
  add column if not exists imei_1 text,
  add column if not exists imei_2 text,
  add column if not exists unique_identifier text;

create table if not exists public.inventory_item_identifiers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('IMEI', 'SERIAL_NUMBER', 'UNIQUE_ID')),
  identifier_value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (shop_id, identifier_value),
  unique (inventory_item_id, sort_order)
);

create index if not exists inventory_item_identifiers_inventory_item_id_idx
  on public.inventory_item_identifiers(inventory_item_id, sort_order);

alter table public.inventory_item_identifiers enable row level security;

drop policy if exists "users can view shop inventory item identifiers" on public.inventory_item_identifiers;
create policy "users can view shop inventory item identifiers"
on public.inventory_item_identifiers
for select using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = inventory_item_identifiers.shop_id
      and shop_members.user_id = auth.uid()
  )
);

drop policy if exists "owners and admins can manage inventory item identifiers" on public.inventory_item_identifiers;
create policy "owners and admins can manage inventory item identifiers"
on public.inventory_item_identifiers
for all using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = inventory_item_identifiers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
) with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = inventory_item_identifiers.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);

create unique index if not exists inventory_items_shop_imei_1_idx
  on public.inventory_items(shop_id, imei_1)
  where imei_1 is not null and trim(imei_1) <> '';

create unique index if not exists inventory_items_shop_imei_2_idx
  on public.inventory_items(shop_id, imei_2)
  where imei_2 is not null and trim(imei_2) <> '';

create unique index if not exists inventory_items_shop_unique_identifier_idx
  on public.inventory_items(shop_id, unique_identifier)
  where unique_identifier is not null and trim(unique_identifier) <> '';

update public.products
set short_description = description
where short_description is null
  and description is not null;

update public.inventory_items
set
  imei_1 = case
    when identifier_type = 'IMEI' and position(' | ' in serial_number) > 0 then nullif(trim(split_part(serial_number, ' | ', 1)), '')
    when identifier_type = 'IMEI' then nullif(trim(serial_number), '')
    else imei_1
  end,
  imei_2 = case
    when identifier_type = 'IMEI' and position(' | ' in serial_number) > 0 then nullif(trim(split_part(serial_number, ' | ', 2)), '')
    else imei_2
  end,
  unique_identifier = case
    when identifier_type = 'UNIQUE_ID' then nullif(trim(serial_number), '')
    else unique_identifier
  end
where identifier_type in ('IMEI', 'UNIQUE_ID');

insert into public.inventory_item_identifiers (
  shop_id,
  inventory_item_id,
  identifier_type,
  identifier_value,
  sort_order
)
select
  inventory_items.shop_id,
  inventory_items.id,
  'IMEI',
  inventory_items.imei_1,
  0
from public.inventory_items
where inventory_items.imei_1 is not null
  and trim(inventory_items.imei_1) <> ''
on conflict (shop_id, identifier_value) do nothing;

insert into public.inventory_item_identifiers (
  shop_id,
  inventory_item_id,
  identifier_type,
  identifier_value,
  sort_order
)
select
  inventory_items.shop_id,
  inventory_items.id,
  'IMEI',
  inventory_items.imei_2,
  1
from public.inventory_items
where inventory_items.imei_2 is not null
  and trim(inventory_items.imei_2) <> ''
on conflict (shop_id, identifier_value) do nothing;

insert into public.inventory_item_identifiers (
  shop_id,
  inventory_item_id,
  identifier_type,
  identifier_value,
  sort_order
)
select
  inventory_items.shop_id,
  inventory_items.id,
  inventory_items.identifier_type,
  inventory_items.serial_number,
  0
from public.inventory_items
where inventory_items.identifier_type in ('SERIAL_NUMBER', 'UNIQUE_ID')
  and trim(inventory_items.serial_number) <> ''
on conflict (shop_id, identifier_value) do nothing;

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
    is_active
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

create or replace function public.update_inventory_product(
  p_product_id uuid,
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
    short_description = nullif(trim(coalesce(p_short_description, '')), ''),
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

  delete from public.product_highlights
  where product_id = p_product_id
    and shop_id = p_shop_id;

  delete from public.stock_movements
  where product_id = p_product_id
    and shop_id = p_shop_id;

  delete from public.inventory_item_identifiers
  where shop_id = p_shop_id
    and inventory_item_id in (
      select id
      from public.inventory_items
      where product_id = p_product_id
        and shop_id = p_shop_id
    );

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
        p_product_id,
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
        p_product_id,
        v_highlight_label,
        v_highlight_value,
        greatest(coalesce((v_highlight ->> 'sort_order')::integer, 0), 0)
      );
    end loop;
  end if;

  return p_product_id;
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
  text,
  numeric,
  numeric,
  numeric,
  integer,
  boolean,
  jsonb,
  jsonb,
  jsonb
) to authenticated;

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
  text,
  numeric,
  numeric,
  numeric,
  integer,
  boolean,
  jsonb,
  jsonb,
  jsonb
) to authenticated;
