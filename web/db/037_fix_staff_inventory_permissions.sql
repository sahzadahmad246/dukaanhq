-- Migration 037: GLOBAL RLS REFRESH FOR STAFF ACCESS
-- This script force-drops and recreates ALL inventory policies to ensure 'staff' works.

DO $$ 
DECLARE 
    policy_record RECORD;
BEGIN
    -- 1. Automagically drop ALL existing policies for inventory tables to avoid "already exists" errors
    FOR policy_record IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('brands', 'categories', 'products', 'product_variants', 'stock_movements', 'inventory_items', 'product_images', 'shop_qr_counters', 'product_highlights')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_record.policyname, policy_record.tablename);
    END LOOP;
END $$;

-- 2. RECREATE POLICIES WITH STAFF SUPPORT

-- BRANDS
create policy "brands_select" on public.brands for select using (exists (select 1 from public.shop_members where shop_id = brands.shop_id and user_id = auth.uid()));
create policy "brands_insert" on public.brands for insert with check (exists (select 1 from public.shop_members where shop_id = brands.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "brands_update" on public.brands for update using (exists (select 1 from public.shop_members where shop_id = brands.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- CATEGORIES
create policy "categories_select" on public.categories for select using (exists (select 1 from public.shop_members where shop_id = categories.shop_id and user_id = auth.uid()));
create policy "categories_insert" on public.categories for insert with check (exists (select 1 from public.shop_members where shop_id = categories.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "categories_update" on public.categories for update using (exists (select 1 from public.shop_members where shop_id = categories.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- PRODUCTS
create policy "products_select" on public.products for select using (exists (select 1 from public.shop_members where shop_id = products.shop_id and user_id = auth.uid()));
create policy "products_insert" on public.products for insert with check (exists (select 1 from public.shop_members where shop_id = products.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "products_update" on public.products for update using (exists (select 1 from public.shop_members where shop_id = products.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "products_delete" on public.products for delete using (exists (select 1 from public.shop_members where shop_id = products.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- PRODUCT_VARIANTS
create policy "variants_select" on public.product_variants for select using (exists (select 1 from public.shop_members where shop_id = product_variants.shop_id and user_id = auth.uid()));
create policy "variants_insert" on public.product_variants for insert with check (exists (select 1 from public.shop_members where shop_id = product_variants.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "variants_update" on public.product_variants for update using (exists (select 1 from public.shop_members where shop_id = product_variants.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- STOCK_MOVEMENTS
create policy "movements_select" on public.stock_movements for select using (exists (select 1 from public.shop_members where shop_id = stock_movements.shop_id and user_id = auth.uid()));
create policy "movements_insert" on public.stock_movements for insert with check (exists (select 1 from public.shop_members where shop_id = stock_movements.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- INVENTORY_ITEMS
create policy "items_select" on public.inventory_items for select using (exists (select 1 from public.shop_members where shop_id = inventory_items.shop_id and user_id = auth.uid()));
create policy "items_insert" on public.inventory_items for insert with check (exists (select 1 from public.shop_members where shop_id = inventory_items.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "items_update" on public.inventory_items for update using (exists (select 1 from public.shop_members where shop_id = inventory_items.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- SHOP_QR_COUNTERS
create policy "qr_select" on public.shop_qr_counters for select using (exists (select 1 from public.shop_members where shop_id = shop_qr_counters.shop_id and user_id = auth.uid()));
create policy "qr_all" on public.shop_qr_counters for all using (exists (select 1 from public.shop_members where shop_id = shop_qr_counters.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- PRODUCT_IMAGES
create policy "product_images_select" on public.product_images for select using (exists (select 1 from public.shop_members where shop_id = product_images.shop_id and user_id = auth.uid()));
create policy "product_images_insert" on public.product_images for insert with check (exists (select 1 from public.shop_members where shop_id = product_images.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));
create policy "product_images_delete" on public.product_images for delete using (exists (select 1 from public.shop_members where shop_id = product_images.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- PRODUCT_HIGHLIGHTS
create policy "product_highlights_select" on public.product_highlights for select using (exists (select 1 from public.shop_members where shop_id = product_highlights.shop_id and user_id = auth.uid()));
create policy "product_highlights_all" on public.product_highlights for all using (exists (select 1 from public.shop_members where shop_id = product_highlights.shop_id and user_id = auth.uid() and role in ('owner', 'staff')));

-- 3. FINAL ROLE CLEANUP
-- This ensures all users are actually recognized as 'staff' in the DB
update public.shop_members set role = 'staff' where role = 'admin';
update public.shop_member_invitations set role = 'staff' where role = 'admin';
update public.profiles set role = 'staff' where role = 'admin';
