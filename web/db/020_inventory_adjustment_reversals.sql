-- Add reversal support for damaged / returned stock adjustments.

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
  v_movement_type text := null;
  v_quantity_change integer := 0;
  v_serialized_restore_status text := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_adjustment_type not in ('ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'RETURN', 'DAMAGE', 'RESTORE_RETURNED', 'RESTORE_DAMAGED') then
    raise exception 'Invalid adjustment type';
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

    if p_adjustment_type in ('ADJUSTMENT_REMOVE', 'DAMAGE', 'RETURN') and coalesce(v_variant.quantity, 0) < v_quantity then
      raise exception 'Insufficient stock';
    end if;

    update public.product_variants
    set quantity =
      case
        when p_adjustment_type in ('ADJUSTMENT_ADD', 'RESTORE_RETURNED', 'RESTORE_DAMAGED') then coalesce(quantity, 0) + v_quantity
        else coalesce(quantity, 0) - v_quantity
      end
    where id = p_variant_id;

    v_movement_type := case
      when p_adjustment_type = 'RESTORE_RETURNED' then 'ADJUSTMENT_ADD'
      when p_adjustment_type = 'RESTORE_DAMAGED' then 'ADJUSTMENT_ADD'
      else p_adjustment_type
    end;

    v_quantity_change := case
      when p_adjustment_type in ('ADJUSTMENT_ADD', 'RESTORE_RETURNED', 'RESTORE_DAMAGED') then v_quantity
      else -1 * v_quantity
    end;

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
      v_movement_type,
      v_quantity_change,
      case
        when p_adjustment_type = 'RESTORE_RETURNED' then coalesce(v_reason, 'Restored from returned stock')
        when p_adjustment_type = 'RESTORE_DAMAGED' then coalesce(v_reason, 'Restored from damaged stock')
        else v_reason
      end,
      v_user_id
    );

    return;
  end if;

  if p_adjustment_type in ('ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE') then
    raise exception 'Serialized products support damage, return, and restore adjustments only';
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
      -1,
      v_reason,
      v_user_id
    );

    return;
  end if;

  if p_adjustment_type = 'RESTORE_RETURNED' then
    if v_inventory_item.status <> 'RETURNED' then
      raise exception 'Only returned units can be restored';
    end if;

    v_serialized_restore_status := 'IN_STOCK';
  elsif p_adjustment_type = 'RESTORE_DAMAGED' then
    if v_inventory_item.status <> 'DAMAGED' then
      raise exception 'Only damaged units can be restored';
    end if;

    v_serialized_restore_status := 'IN_STOCK';
  end if;

  if v_serialized_restore_status is not null then
    update public.inventory_items
    set status = v_serialized_restore_status
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
      'ADJUSTMENT_ADD',
      1,
      case
        when p_adjustment_type = 'RESTORE_RETURNED' then coalesce(v_reason, 'Restored returned unit to stock')
        else coalesce(v_reason, 'Restored damaged unit to stock')
      end,
      v_user_id
    );

    return;
  end if;
end;
$$;

grant execute on function public.adjust_inventory_stock(uuid, uuid, text, uuid, uuid, integer, text) to authenticated;
