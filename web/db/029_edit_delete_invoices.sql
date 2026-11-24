create or replace function public.delete_inventory_invoice(
  p_invoice_id uuid,
  p_restock_items boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice record;
  v_item record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if not exists (
    select 1 from public.shop_members
    where shop_members.shop_id = v_invoice.shop_id
      and shop_members.user_id = v_user_id
  ) then
    raise exception 'Not allowed to delete invoices';
  end if;

  if p_restock_items then
    -- Revert stock limits for all items
    for v_item in
      select * from public.invoice_items where invoice_id = p_invoice_id
    loop
      -- if serialized item
      if v_item.inventory_item_id is not null then
        update public.inventory_items
        set status = 'IN_STOCK',
            sold_at = null
        where id = v_item.inventory_item_id;

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
          v_invoice.shop_id,
          v_item.product_id,
          v_item.variant_id,
          v_item.inventory_item_id,
          'RETURN',
          1,
          'Invoice deleted',
          v_user_id
        );
      elsif v_item.variant_id is not null then
        -- Quantity based
        update public.product_variants
        set quantity = quantity + v_item.quantity
        where id = v_item.variant_id;

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
          v_invoice.shop_id,
          v_item.product_id,
          v_item.variant_id,
          'RETURN',
          v_item.quantity,
          'Invoice deleted',
          v_user_id
        );
      end if;
    end loop;
  end if;

  -- Remove the invoice itself (will cascade delete items)
  delete from public.invoices where id = p_invoice_id;
end;
$$;


create or replace function public.update_invoice_details(
  p_invoice_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text,
  p_payment_details jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice record;
  v_customer_id uuid;
  v_customer_name text := trim(coalesce(p_customer ->> 'name', ''));
  v_customer_mobile text := nullif(trim(coalesce(p_customer ->> 'mobile', '')), '');
  v_billing_address text := nullif(trim(coalesce(p_customer ->> 'billing_address', '')), '');
  v_customer_gst text := nullif(trim(coalesce(p_customer ->> 'gst_number', '')), '');
  
  v_item jsonb;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_tax_rate numeric(5,2);
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_grand_total numeric(12,2) := 0;

  v_product record;
  v_variant record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if not exists (
    select 1 from public.shop_members
    where shop_members.shop_id = v_invoice.shop_id
      and shop_members.user_id = v_user_id
  ) then
    raise exception 'Not allowed to edit invoices';
  end if;

  if v_customer_name = '' then
    raise exception 'Customer name is required';
  end if;

  if v_customer_mobile is null then
    raise exception 'Customer mobile is required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one invoice item is required';
  end if;

  -- Update customer or link
  select customers.id
  into v_customer_id
  from public.customers
  where customers.shop_id = v_invoice.shop_id
    and customers.mobile = v_customer_mobile
  order by customers.created_at asc
  limit 1
  for update;

  if v_customer_id is not null then
    update public.customers
    set name = v_customer_name,
        billing_address = coalesce(v_billing_address, billing_address),
        gst_number = coalesce(v_customer_gst, gst_number)
    where id = v_customer_id;
  else
    insert into public.customers (
      shop_id, name, mobile, billing_address, gst_number
    ) values (
      v_invoice.shop_id, v_customer_name, v_customer_mobile, v_billing_address, v_customer_gst
    ) returning id into v_customer_id;
  end if;

  -- Update Invoice Header
  update public.invoices
  set customer_id = v_customer_id,
      customer_name = v_customer_name,
      customer_mobile = v_customer_mobile,
      billing_address = v_billing_address,
      customer_gst_number = v_customer_gst,
      payment_method = coalesce(nullif(trim(p_payment_method), ''), 'CASH'),
      payment_details = coalesce(p_payment_details, '{"methods":["CASH"]}'::jsonb),
      notes = nullif(trim(p_notes), '')
  where id = p_invoice_id;

  -- Delete all existing items. We do NOT revert stock per user request.
  delete from public.invoice_items where invoice_id = p_invoice_id;

  -- Re-insert items
  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);
    v_line_total := coalesce((v_item ->> 'line_total')::numeric, greatest((v_unit_price * v_quantity) - v_discount, 0));

    select id, name, category_id, brand_id, tracking_type, product_kind, base_selling_price, tax_rate
    into v_product
    from public.products
    where products.id = (v_item ->> 'product_id')::uuid
      and products.shop_id = v_invoice.shop_id;

    if v_product.id is null then
      raise exception 'Product not found for invoice item';
    end if;

    if (v_item ->> 'variant_id') is not null and (v_item ->> 'variant_id') <> '' then
      select id, name into v_variant
      from public.product_variants
      where product_variants.id = (v_item ->> 'variant_id')::uuid;
    else
      v_variant := null;
    end if;

    insert into public.invoice_items (
      shop_id, invoice_id, product_id, variant_id, inventory_item_id,
      product_name_snapshot, brand_name_snapshot, category_name_snapshot, variant_name_snapshot,
      identifier_snapshot, quantity, unit_price, tax_rate, discount_amount, line_total
    ) values (
      v_invoice.shop_id, p_invoice_id, v_product.id, v_variant.id, nullif((v_item ->> 'inventory_item_id'), '')::uuid,
      v_product.name, 
      (select name from public.brands where id = v_product.brand_id), 
      (select name from public.categories where id = v_product.category_id), 
      coalesce(v_item ->> 'variant_name_snapshot', v_variant.name),
      nullif(v_item ->> 'identifier_snapshot', ''),
      v_quantity, v_unit_price, v_tax_rate, v_discount, v_line_total
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + ((greatest((v_unit_price * v_quantity) - v_discount, 0)) * (v_tax_rate / 100));
    v_grand_total := v_grand_total + v_line_total;
  end loop;

  update public.invoices
  set subtotal = round(v_subtotal, 2),
      tax_total = round(v_tax_total, 2),
      discount_total = round(v_discount_total, 2),
      grand_total = round(v_grand_total, 2)
  where id = p_invoice_id;

  return p_invoice_id;
end;
$$;

grant execute on function public.delete_inventory_invoice(uuid, boolean) to authenticated;
grant execute on function public.update_invoice_details(uuid, jsonb, jsonb, text, text, jsonb) to authenticated;
