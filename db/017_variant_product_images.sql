-- Allow gallery images to be linked to a specific product variant/color.

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  image_public_id text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_images
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;

create index if not exists product_images_product_id_idx
  on public.product_images(product_id, sort_order);

create index if not exists product_images_variant_id_idx
  on public.product_images(variant_id, sort_order);

alter table public.product_images enable row level security;

drop policy if exists "users can view shop product images" on public.product_images;
create policy "users can view shop product images"
on public.product_images
for select
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
  )
);

drop policy if exists "owners and admins can insert product images" on public.product_images;
create policy "owners and admins can insert product images"
on public.product_images
for insert
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
);

drop policy if exists "owners and admins can delete product images" on public.product_images;
create policy "owners and admins can delete product images"
on public.product_images
for delete
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'admin')
  )
);
