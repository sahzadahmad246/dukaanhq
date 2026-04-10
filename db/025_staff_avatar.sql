-- Add avatar_url to shop_members so staff can have profile pictures
alter table public.shop_members
  add column if not exists avatar_url text;
