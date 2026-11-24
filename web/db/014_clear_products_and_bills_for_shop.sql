-- Clear billing + inventory data for a single shop.
-- This is the safe option for a rewrite because it only wipes one shop.
--
-- How to use:
-- 1) Replace the placeholder shop id below.
-- 2) Run the script in Supabase SQL editor / psql.
-- 3) Review the counts returned at the end.

begin;

do $$
declare
  v_shop_id uuid := '00000000-0000-0000-0000-000000000000'; -- TODO: replace with your real shop_id
begin
  if v_shop_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set v_shop_id before running this script.';
  end if;

  -- Billing
  delete from public.invoice_items where shop_id = v_shop_id;
  delete from public.invoices where shop_id = v_shop_id;
  delete from public.customers where shop_id = v_shop_id;

  -- Inventory
  delete from public.stock_movements where shop_id = v_shop_id;
  delete from public.inventory_items where shop_id = v_shop_id;
  delete from public.product_variants where shop_id = v_shop_id;
  delete from public.product_images where shop_id = v_shop_id;
  delete from public.products where shop_id = v_shop_id;
  delete from public.brands where shop_id = v_shop_id;
  delete from public.categories where shop_id = v_shop_id;
end $$;

commit;

select
  (select count(*) from public.customers) as customers_remaining,
  (select count(*) from public.invoices) as invoices_remaining,
  (select count(*) from public.invoice_items) as invoice_items_remaining,
  (select count(*) from public.products) as products_remaining,
  (select count(*) from public.product_variants) as product_variants_remaining,
  (select count(*) from public.inventory_items) as inventory_items_remaining,
  (select count(*) from public.stock_movements) as stock_movements_remaining;
