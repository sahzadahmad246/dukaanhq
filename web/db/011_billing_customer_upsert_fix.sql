-- Fix billing customer upsert for partial unique index and require complete customer info

create or replace function public.create_inventory_invoice(
  p_shop_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text default 'CASH',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice_id uuid;
  v_customer_id uuid;
  v_customer_name text := trim(coalesce(p_customer ->> 'name', ''));
  v_customer_mobile text := nullif(trim(coalesce(p_customer ->> 'mobile', '')), '');
  v_billing_address text := nullif(trim(coalesce(p_customer ->> 'billing_address', '')), '');
  v_customer_gst text := nullif(trim(coalesce(p_customer ->> 'gst_number', '')), '');
  v_item jsonb;
  v_invoice_number text;
  v_next_invoice_number integer;
  v_product record;
  v_variant record;
  v_inventory_item record;
  v_shop record;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_tax_rate numeric(5,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.shop_members
    where shop_members.shop_id = p_shop_id
      and shop_members.user_id = v_user_id
      and shop_members.role in ('owner', 'staff')
  ) then
    raise exception 'Not allowed to create invoices';
  end if;

  if v_customer_name = '' then
    raise exception 'Customer name is required';
  end if;

  if v_customer_mobile is null then
    raise exception 'Customer mobile is required';
  end if;

  if v_billing_address is null then
    raise exception 'Billing address is required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one invoice item is required';
  end if;

  select
    shops.name,
    concat_ws(', ', shops.address_line_1, shops.city, shops.state) as full_address,
    shops.phone,
    shops.gst_number,
    shop_settings.invoice_prefix,
    shop_settings.invoice_footer
  into v_shop
  from public.shops
  left join public.shop_settings on shop_settings.shop_id = shops.id
  where shops.id = p_shop_id;

  if v_shop.name is null then
    raise exception 'Shop not found';
  end if;

  select customers.id
  into v_customer_id
  from public.customers
  where customers.shop_id = p_shop_id
    and customers.mobile = v_customer_mobile
  order by customers.created_at asc
  limit 1
  for update;

  if v_customer_id is not null then
    update public.customers
    set name = v_customer_name,
        billing_address = v_billing_address,
        gst_number = v_customer_gst
    where id = v_customer_id;
  else
    insert into public.customers (
      shop_id,
      name,
      mobile,
      billing_address,
      gst_number
    )
    values (
      p_shop_id,
      v_customer_name,
      v_customer_mobile,
      v_billing_address,
      v_customer_gst
    )
    returning id into v_customer_id;
  end if;

  select count(*) + 1
  into v_next_invoice_number
  from public.invoices
  where invoices.shop_id = p_shop_id;

  v_invoice_number := coalesce(v_shop.invoice_prefix, 'INV') || '-' || lpad(v_next_invoice_number::text, 6, '0');

  insert into public.invoices (
    shop_id,
    customer_id,
    invoice_number,
    customer_name,
    customer_mobile,
    billing_address,
    customer_gst_number,
    payment_method,
    payment_status,
    notes,
    shop_name_snapshot,
    shop_address_snapshot,
    shop_phone_snapshot,
    shop_gst_snapshot,
    invoice_footer_snapshot,
    created_by
  )
  values (
    p_shop_id,
    v_customer_id,
    v_invoice_number,
    v_customer_name,
    v_customer_mobile,
    v_billing_address,
    v_customer_gst,
    coalesce(nullif(trim(p_payment_method), ''), 'CASH'),
    'PAID',
    nullif(trim(p_notes), ''),
    v_shop.name,
    v_shop.full_address,
    v_shop.phone,
    v_shop.gst_number,
    v_shop.invoice_footer,
    v_user_id
  )
  returning id into v_invoice_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
    v_line_total := coalesce((v_item ->> 'line_total')::numeric, greatest((v_unit_price * v_quantity) - v_discount, 0));

    select
      products.id,
      products.name,
      products.category_id,
      products.brand_id,
      products.tracking_type,
      products.product_kind,
      products.base_selling_price,
      products.tax_rate,
      brands.name as brand_name,
      categories.name as category_name
    into v_product
    from public.products
    left join public.brands on brands.id = products.brand_id
    left join public.categories on categories.id = products.category_id
    where products.id = (v_item ->> 'product_id')::uuid
      and products.shop_id = p_shop_id;

    if v_product.id is null then
      raise exception 'Product not found for invoice item';
    end if;

    if (v_item ->> 'variant_id') is not null and (v_item ->> 'variant_id') <> '' then
      select *
      into v_variant
      from public.product_variants
      where product_variants.id = (v_item ->> 'variant_id')::uuid
        and product_variants.product_id = v_product.id
        and product_variants.shop_id = p_shop_id;
    else
      v_variant := null;
    end if;

    if v_product.tracking_type = 'SERIALIZED' then
      if v_quantity <> 1 then
        raise exception 'Serialized products must have quantity 1';
      end if;

      if (v_item ->> 'inventory_item_id') is null or (v_item ->> 'inventory_item_id') = '' then
        raise exception 'Serialized products require an inventory unit';
      end if;

      select *
      into v_inventory_item
      from public.inventory_items
      where inventory_items.id = (v_item ->> 'inventory_item_id')::uuid
        and inventory_items.product_id = v_product.id
        and inventory_items.shop_id = p_shop_id
        and inventory_items.status = 'IN_STOCK'
      for update;

      if v_inventory_item.id is null then
        raise exception 'Selected inventory unit is not available';
      end if;

      update public.inventory_items
      set status = 'SOLD',
          sold_at = now()
      where id = v_inventory_item.id;

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
        v_product.id,
        v_inventory_item.variant_id,
        v_inventory_item.id,
        'SALE',
        -1,
        'Sold through invoice ' || v_invoice_number,
        v_user_id
      );
    else
      if v_variant.id is null then
        raise exception 'Quantity-based products require a variant';
      end if;

      update public.product_variants
      set quantity = quantity - v_quantity
      where id = v_variant.id
        and quantity >= v_quantity;

      if not found then
        raise exception 'Insufficient stock for %', v_product.name;
      end if;

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
        v_product.id,
        v_variant.id,
        'SALE',
        -1 * v_quantity,
        'Sold through invoice ' || v_invoice_number,
        v_user_id
      );
    end if;

    insert into public.invoice_items (
      shop_id,
      invoice_id,
      product_id,
      variant_id,
      inventory_item_id,
      product_name_snapshot,
      brand_name_snapshot,
      category_name_snapshot,
      variant_name_snapshot,
      identifier_snapshot,
      quantity,
      unit_price,
      tax_rate,
      discount_amount,
      line_total
    )
    values (
      p_shop_id,
      v_invoice_id,
      v_product.id,
      v_variant.id,
      v_inventory_item.id,
      v_product.name,
      v_product.brand_name,
      v_product.category_name,
      coalesce(v_item ->> 'variant_name_snapshot', v_variant.name),
      nullif(v_item ->> 'identifier_snapshot', ''),
      v_quantity,
      v_unit_price,
      v_tax_rate,
      v_discount,
      v_line_total
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + ((greatest((v_unit_price * v_quantity) - v_discount, 0)) * (v_tax_rate / 100));
    v_grand_total := v_grand_total + v_line_total;

    v_inventory_item := null;
  end loop;

  update public.invoices
  set subtotal = round(v_subtotal, 2),
      tax_total = round(v_tax_total, 2),
      discount_total = round(v_discount_total, 2),
      grand_total = round(v_grand_total, 2)
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

grant execute on function public.create_inventory_invoice(uuid, jsonb, jsonb, text, text) to authenticated;
