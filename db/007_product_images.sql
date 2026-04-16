create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  image_public_id text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_id_idx on public.product_images(product_id, sort_order);

alter table public.product_images enable row level security;

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

create policy "owners and admins can insert product images"
on public.product_images
for insert
with check (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = product_images.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
