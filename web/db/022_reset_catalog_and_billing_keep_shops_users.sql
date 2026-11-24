-- Reset catalog, inventory, and billing data while keeping users and shops.
-- This preserves:
--   - auth.users
--   - public.profiles
--   - public.shops
--   - public.shop_members
--   - public.shop_settings
--
-- Recommended: use the shop-only block first.
-- Use the global block only when you intentionally want every shop to start fresh.

-- =========================================================
-- 1) SHOP-ONLY RESET
-- =========================================================
/*
begin;

do $$
declare
  v_shop_id uuid := '00000000-0000-0000-0000-000000000000'; -- TODO: replace with your real shop_id
begin
  if v_shop_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Set v_shop_id before running the shop-only reset.';
  end if;

  delete from public.invoice_items where shop_id = v_shop_id;
  delete from public.invoices where shop_id = v_shop_id;
  delete from public.customers where shop_id = v_shop_id;
  delete from public.shop_invoice_counters where shop_id = v_shop_id;

  delete from public.stock_movements where shop_id = v_shop_id;
  delete from public.inventory_item_identifiers where shop_id = v_shop_id;
  delete from public.inventory_items where shop_id = v_shop_id;
  delete from public.product_highlights where shop_id = v_shop_id;
  delete from public.product_images where shop_id = v_shop_id;
  delete from public.product_variants where shop_id = v_shop_id;
  delete from public.products where shop_id = v_shop_id;
  delete from public.brands where shop_id = v_shop_id;
  delete from public.categories where shop_id = v_shop_id;
  delete from public.shop_qr_counters where shop_id = v_shop_id;
end $$;

commit;
*/

-- =========================================================
-- 2) GLOBAL RESET FOR ALL SHOPS
-- =========================================================
begin;

delete from public.invoice_items;
delete from public.invoices;
delete from public.customers;
delete from public.shop_invoice_counters;

delete from public.stock_movements;
delete from public.inventory_item_identifiers;
delete from public.inventory_items;
delete from public.product_highlights;
delete from public.product_images;
delete from public.product_variants;
delete from public.products;
delete from public.brands;
delete from public.categories;
delete from public.shop_qr_counters;

commit;

select
  (select count(*) from public.categories) as categories_remaining,
  (select count(*) from public.brands) as brands_remaining,
  (select count(*) from public.products) as products_remaining,
  (select count(*) from public.product_variants) as product_variants_remaining,
  (select count(*) from public.product_images) as product_images_remaining,
  (select count(*) from public.product_highlights) as product_highlights_remaining,
  (select count(*) from public.inventory_items) as inventory_items_remaining,
  (select count(*) from public.inventory_item_identifiers) as inventory_item_identifiers_remaining,
  (select count(*) from public.stock_movements) as stock_movements_remaining,
  (select count(*) from public.customers) as customers_remaining,
  (select count(*) from public.invoices) as invoices_remaining,
  (select count(*) from public.invoice_items) as invoice_items_remaining,
  (select count(*) from public.shop_invoice_counters) as shop_invoice_counters_remaining,
  (select count(*) from public.shop_qr_counters) as shop_qr_counters_remaining;
