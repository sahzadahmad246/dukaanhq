create policy "owners and admins can delete products"
on public.products
for delete
using (
  exists (
    select 1
    from public.shop_members
    where shop_members.shop_id = products.shop_id
      and shop_members.user_id = auth.uid()
      and shop_members.role in ('owner', 'staff')
  )
);
