-- Read complete bill history in stable batches, with totals over the full filter.
begin;
create index if not exists invoices_history_cursor_idx
  on public.invoices(shop_id, is_second_hand, invoice_date desc, id desc);
create index if not exists invoice_items_invoice_history_idx on public.invoice_items(invoice_id);

create or replace function public.list_shop_invoice_history(
  p_shop_id uuid,
  p_is_second_hand boolean default false,
  p_search text default '',
  p_from timestamptz default null,
  p_cursor_date timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30,
  p_include_summary boolean default true
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_search text := lower(trim(coalesce(p_search, '')));
  v_result jsonb;
begin
  if not exists (select 1 from public.shop_members m where m.shop_id = p_shop_id
    and m.user_id = auth.uid() and m.status = 'ACTIVE'
    and (m.role = 'owner' or (m.role = 'staff' and not p_is_second_hand))) then
    raise exception 'Not allowed to view this bill history';
  end if;
  if (p_cursor_date is null) <> (p_cursor_id is null) then
    raise exception 'Invalid bill history cursor';
  end if;

  with filtered as not materialized (
    select i.* from public.invoices i
    where i.shop_id = p_shop_id and i.is_second_hand = p_is_second_hand
      and (p_from is null or i.invoice_date >= p_from)
      and (v_search = '' or strpos(lower(concat_ws(' ', i.invoice_number, i.customer_name,
        i.customer_mobile, i.billing_address, i.customer_gst_number, i.payment_method,
        i.payment_status, i.notes, i.payment_details::text)), v_search) > 0
        or exists (select 1 from public.invoice_items li where li.invoice_id = i.id
          and strpos(lower(concat_ws(' ', li.product_name_snapshot, li.brand_name_snapshot,
            li.category_name_snapshot, li.variant_name_snapshot, li.identifier_snapshot)), v_search) > 0))
  ), candidates as (
    select * from filtered
    where p_cursor_date is null or (invoice_date, id) < (p_cursor_date, p_cursor_id)
    order by invoice_date desc, id desc limit v_limit + 1
  ), batch as (
    select * from candidates order by invoice_date desc, id desc limit v_limit
  )
  select jsonb_build_object(
    'invoices', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'invoice_items', coalesce((select jsonb_agg(to_jsonb(li) order by li.created_at, li.id)
        from public.invoice_items li where li.invoice_id = b.id), '[]'::jsonb))
      order by b.invoice_date desc, b.id desc) from batch b), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > v_limit then
      (select jsonb_build_object('date', invoice_date, 'id', id) from batch order by invoice_date, id limit 1)
      else null end,
    'summary', case when p_include_summary then (select jsonb_build_object(
      'count', count(*), 'totalValue', coalesce(sum(grand_total), 0),
      'avgValue', coalesce(avg(grand_total), 0)) from filtered) else null end
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_shop_invoice_history(uuid, boolean, text, timestamptz, timestamptz, uuid, integer, boolean) from public;
grant execute on function public.list_shop_invoice_history(uuid, boolean, text, timestamptz, timestamptz, uuid, integer, boolean) to authenticated;
commit;
