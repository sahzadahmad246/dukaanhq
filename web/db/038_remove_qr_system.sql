-- Migration to remove all QR-related schema
-- This will delete columns from product_variants and inventory_items, and drop the shop_qr_counters table.

-- 1. Drop the QR counters table
DROP TABLE IF EXISTS public.shop_qr_counters CASCADE;

-- 2. Remove columns from product_variants
ALTER TABLE public.product_variants 
DROP COLUMN IF EXISTS label_code,
DROP COLUMN IF EXISTS qr_payload;

-- 3. Remove columns from inventory_items
ALTER TABLE public.inventory_items
DROP COLUMN IF EXISTS label_code,
DROP COLUMN IF EXISTS qr_payload;

-- 4. Drop the allocation function
DROP FUNCTION IF EXISTS public.allocate_qr_label_range;
