-- Add customer_signature_url column to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_signature_url text;
-- Add invoice_pdf_url column for auto-send PDF storage
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_pdf_url text;

create or replace function public.create_inventory_invoice(
  p_shop_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text default 'CASH',
  p_payment_details jsonb default null,
  p_customer_signature_url text default null,
  p_invoice_pdf_url text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  v_invoice_id := public.create_inventory_invoice(
    p_shop_id,
    p_customer,
    p_items,
    p_payment_method,
    p_payment_details,
    p_notes
  );

  update public.invoices
  set customer_signature_url = nullif(trim(p_customer_signature_url), ''),
      invoice_pdf_url = nullif(trim(p_invoice_pdf_url), '')
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

grant execute on function public.create_inventory_invoice(uuid, jsonb, jsonb, text, jsonb, text, text, text) to authenticated;

create or replace function public.update_invoice_details(
  p_invoice_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text,
  p_payment_details jsonb default null,
  p_customer_signature_url text default null,
  p_invoice_pdf_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  v_invoice_id := public.update_invoice_details(
    p_invoice_id,
    p_customer,
    p_items,
    p_payment_method,
    p_notes,
    p_payment_details
  );

  update public.invoices
  set customer_signature_url = nullif(trim(p_customer_signature_url), ''),
      invoice_pdf_url = nullif(trim(p_invoice_pdf_url), '')
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

grant execute on function public.update_invoice_details(uuid, jsonb, jsonb, text, text, jsonb, text, text) to authenticated;
