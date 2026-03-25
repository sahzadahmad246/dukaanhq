-- Record a sale without generating a bill.
-- Useful for walk-in sales where the customer does not need an invoice.

create or replace function public.record_inventory_sale(
  p_shop_id uuid,
  p_product_id uuid,
  p_variant_id uuid default null,
  p_inventory_item_id uuid default null,
  p_quantity integer default 1,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_variant record;
  v_inventory_item record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
    and shop_id = p_shop_id;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.tracking_type = 'SERIALIZED' then
    if p_quantity <> 1 then
      raise exception 'Serialized products can only be sold one at a time';
    end if;

    if p_inventory_item_id is null then
      raise exception 'Serialized sales require a stock unit';
    end if;

    select *
    into v_inventory_item
    from public.inventory_items
    where id = p_inventory_item_id
      and product_id = p_product_id
      and shop_id = p_shop_id
      and status = 'IN_STOCK'
    for update;

    if not found then
      raise exception 'Selected stock unit is not available';
    end if;

    update public.inventory_items
    set status = 'SOLD',
        sold_at = now()
    where id = p_inventory_item_id;

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
      v_inventory_item.variant_id,
      p_inventory_item_id,
      'SALE',
      -1,
      coalesce('Sold without invoice' || case when v_reason is not null then ' - ' || v_reason else '' end, 'Sold without invoice'),
      v_user_id
    );

    return;
  end if;

  if p_variant_id is null then
    raise exception 'Quantity-based sales require a variant';
  end if;

  select *
  into v_variant
  from public.product_variants
  where id = p_variant_id
    and product_id = p_product_id
    and shop_id = p_shop_id;

  if not found then
    raise exception 'Variant not found';
  end if;

  update public.product_variants
  set quantity = quantity - p_quantity
  where id = p_variant_id
    and quantity >= p_quantity;

  if not found then
    raise exception 'Insufficient stock';
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
    p_product_id,
    p_variant_id,
    'SALE',
    -1 * p_quantity,
    coalesce('Sold without invoice' || case when v_reason is not null then ' - ' || v_reason else '' end, 'Sold without invoice'),
    v_user_id
  );
end;
$$;

grant execute on function public.record_inventory_sale(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text
) to authenticated;
