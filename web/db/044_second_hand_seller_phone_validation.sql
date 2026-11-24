-- Preserve existing purchase history; enforce the chosen dial code + ten digits
-- for new records, including purchases created directly through the RPC.
begin;
alter table public.second_hand_purchases
  drop constraint if exists second_hand_seller_phone_format;
alter table public.second_hand_purchases
  add constraint second_hand_seller_phone_format
  check (seller_phone ~ '^\+[1-9][0-9]{0,3} [0-9]{10}$') not valid;
commit;
