create table if not exists public.emi_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  due_date date not null,
  reminder_type text not null check (reminder_type in ('before_due', 'due_today')),
  customer_mobile text,
  twilio_message_sid text,
  twilio_status text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (invoice_id, due_date, reminder_type)
);

create index if not exists idx_emi_reminders_invoice_id
  on public.emi_reminders(invoice_id);

create index if not exists idx_emi_reminders_due_date
  on public.emi_reminders(due_date);

alter table public.emi_reminders enable row level security;

drop policy if exists "Shop members can read own EMI reminders" on public.emi_reminders;
create policy "Shop members can read own EMI reminders"
  on public.emi_reminders
  for select
  using (
    exists (
      select 1
      from public.invoices i
      join public.shop_members sm on sm.shop_id = i.shop_id
      where i.id = emi_reminders.invoice_id
        and sm.user_id = auth.uid()
        and sm.role in ('owner', 'staff')
        and coalesce(sm.status, 'ACTIVE') in ('ACTIVE', 'active')
    )
  );
