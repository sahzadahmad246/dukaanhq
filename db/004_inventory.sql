-- Inventory schema for DukaanHQ

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

-- Brands
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  tracking_type text not null check (tracking_type in ('SERIALIZED', 'QUANTITY_BASED')),
  base_purchase_price numeric(12,2) not null default 0,
  base_selling_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  low_stock_threshold integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

-- Product Variants
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  purchase_price_override numeric(12,2),
  selling_price_override numeric(12,2),
  quantity integer not null default 0, -- For QUANTITY_BASED only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory Items (For SERIALIZED products)
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  serial_number text not null,
  purchase_price numeric(12,2) not null,
  status text not null check (status in ('IN_STOCK', 'SOLD', 'RESERVED', 'RETURNED', 'DAMAGED')),
  added_at timestamptz not null default now(),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, serial_number)
);

-- Stock Movements (Audit trial for all stock changes)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  type text not null check (type in ('PURCHASE', 'SALE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_REMOVE', 'RETURN', 'DAMAGE')),
  quantity_change integer not null,
  reason text,
  performed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Triggers for updated_at
drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at before update on public.categories for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_brands_updated_at on public.brands;
create trigger set_brands_updated_at before update on public.brands for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_product_variants_updated_at on public.product_variants;
create trigger set_product_variants_updated_at before update on public.product_variants for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_current_timestamp_updated_at();

-- ENABLE RLS
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;

-- CATEGORIES POLICIES
create policy "users can view shop categories" on public.categories for select using (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert categories" on public.categories for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
create policy "owners and admins can update categories" on public.categories for update using (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = categories.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));

-- BRANDS POLICIES
create policy "users can view shop brands" on public.brands for select using (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert brands" on public.brands for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
create policy "owners and admins can update brands" on public.brands for update using (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = brands.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));

-- PRODUCTS POLICIES
create policy "users can view shop products" on public.products for select using (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert products" on public.products for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
create policy "owners and admins can update products" on public.products for update using (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = products.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));

-- PRODUCT VARIANTS POLICIES
create policy "users can view shop product variants" on public.product_variants for select using (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert product variants" on public.product_variants for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
create policy "owners and admins can update product variants" on public.product_variants for update using (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = product_variants.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));

-- INVENTORY ITEMS POLICIES
create policy "users can view shop inventory items" on public.inventory_items for select using (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert inventory items" on public.inventory_items for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
create policy "owners and admins can update inventory items" on public.inventory_items for update using (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin'))) with check (exists (select 1 from public.shop_members where shop_members.shop_id = inventory_items.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));

-- STOCK MOVEMENTS POLICIES
create policy "users can view shop stock movements" on public.stock_movements for select using (exists (select 1 from public.shop_members where shop_members.shop_id = stock_movements.shop_id and shop_members.user_id = auth.uid()));
create policy "owners and admins can insert stock movements" on public.stock_movements for insert with check (exists (select 1 from public.shop_members where shop_members.shop_id = stock_movements.shop_id and shop_members.user_id = auth.uid() and shop_members.role in ('owner', 'admin')));
-- Stock movements are append-only. No update/delete policies provided.
