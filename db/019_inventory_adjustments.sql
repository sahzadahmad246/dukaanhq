-- Inventory adjustments for manual correction, damage, and return workflows.

create or replace function public.adjust_inventory_stock(
  p_shop_id uuid,
  p_product_id uuid,
  p_adjustment_type text,
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
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_adjustment_type not in ('ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'RETURN', 'DAMAGE') then
    raise exception 'Invalid adjustment type';
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

  select *
  into v_product
  from public.products
  where id = p_product_id
    and shop_id = p_shop_id;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.tracking_type = 'QUANTITY_BASED' then
    if p_variant_id is null then
      raise exception 'Quantity-based adjustments require a variant';
    end if;

    select *
    into v_variant
    from public.product_variants
    where id = p_variant_id
      and product_id = p_product_id
      and shop_id = p_shop_id
    for update;

    if not found then
      raise exception 'Variant not found';
    end if;

    if p_adjustment_type in ('ADJUSTMENT_REMOVE', 'DAMAGE') and coalesce(v_variant.quantity, 0) < v_quantity then
      raise exception 'Insufficient stock';
    end if;

    update public.product_variants
    set quantity =
      case
        when p_adjustment_type = 'ADJUSTMENT_ADD' then coalesce(quantity, 0) + v_quantity
        else coalesce(quantity, 0) - v_quantity
      end
    where id = p_variant_id;

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
      p_adjustment_type,
      case
        when p_adjustment_type = 'ADJUSTMENT_ADD' then v_quantity
        else -1 * v_quantity
      end,
      v_reason,
      v_user_id
    );

    return;
  end if;

  if p_adjustment_type in ('ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE') then
    raise exception 'Serialized products support damage or return adjustments only';
  end if;

  if p_inventory_item_id is null then
    raise exception 'Serialized adjustments require a stock unit';
  end if;

  select *
  into v_inventory_item
  from public.inventory_items
  where id = p_inventory_item_id
    and product_id = p_product_id
    and shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Selected stock unit not found';
  end if;

  if p_adjustment_type = 'DAMAGE' then
    if v_inventory_item.status <> 'IN_STOCK' then
      raise exception 'Only in-stock serialized units can be marked damaged';
    end if;

    update public.inventory_items
    set status = 'DAMAGED'
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
      'DAMAGE',
      -1,
      v_reason,
      v_user_id
    );

    return;
  end if;

  if p_adjustment_type = 'RETURN' then
    if v_inventory_item.status <> 'SOLD' then
      raise exception 'Only sold serialized units can be marked returned';
    end if;

    update public.inventory_items
    set status = 'RETURNED'
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
      'RETURN',
      1,
      v_reason,
      v_user_id
    );

    return;
  end if;
end;
$$;

grant execute on function public.adjust_inventory_stock(uuid, uuid, text, uuid, uuid, integer, text) to authenticated;
