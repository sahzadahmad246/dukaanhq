-- Reset script for inventory + billing data.
-- Choose ONE mode:
--   1) Shop-only reset (recommended): set p_shop_id and run the first block.
--   2) Global reset (all shops): run the second block only if you really want to wipe every shop.

-- =========================================================
-- 1) SHOP-ONLY RESET (RECOMMENDED)
-- =========================================================
do $$
declare
  p_shop_id uuid := '00000000-0000-0000-0000-000000000000'; -- TODO: replace with your real shop_id
begin
  if p_shop_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set p_shop_id before running shop-only reset.';
  end if;

  -- Billing first
  delete from public.invoice_items where shop_id = p_shop_id;
  delete from public.invoices where shop_id = p_shop_id;
  delete from public.customers where shop_id = p_shop_id;

  -- Inventory
  delete from public.stock_movements where shop_id = p_shop_id;
  delete from public.inventory_items where shop_id = p_shop_id;
  delete from public.product_variants where shop_id = p_shop_id;
  delete from public.product_images where shop_id = p_shop_id;
  delete from public.products where shop_id = p_shop_id;
  delete from public.brands where shop_id = p_shop_id;
  delete from public.categories where shop_id = p_shop_id;
end $$;

-- =========================================================
-- 2) GLOBAL RESET (ALL SHOPS) - DANGEROUS
-- =========================================================
-- Uncomment only when you intentionally want to wipe all shops.
/*
begin;
  delete from public.invoice_items;
  delete from public.invoices;
  delete from public.customers;

  delete from public.stock_movements;
  delete from public.inventory_items;
  delete from public.product_variants;
  delete from public.product_images;
  delete from public.products;
  delete from public.brands;
  delete from public.categories;
commit;
*/
